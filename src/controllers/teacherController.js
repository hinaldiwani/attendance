import pool from "../../config/db.js";
import ExcelJS from "exceljs";
import defaulterService from "../services/defaulterService.js";
import notificationService from "../services/notificationService.js";
import {
  getMappedStudents,
  createAttendanceSession,
  finalizeAttendanceSession,
  getTeacherStats,
  logAttendanceToAggregate,
} from "../services/attendanceService.js";

function buildActivityPayload(action, teacherId, meta = {}) {
  return pool.query(
    `INSERT INTO activity_logs (actor_role, actor_id, action, details, created_at) 
     VALUES ('teacher', ?, ?, ?, NOW())`,
    [teacherId, action, JSON.stringify(meta)],
  );
}

export async function teacherDashboard(req, res, next) {
  try {
    const teacherId = req.session.user.id;

    // Get teacher details including subject and stream
    const [teacher] = await pool.query(
      `SELECT teacher_id, name, subject, stream
       FROM teacher_details_db
       WHERE teacher_id = ?`,
      [teacherId],
    );

    const teacherInfo = teacher?.[0] || {};
    const stats = await getTeacherStats(teacherId);

    // Get streams, years, semesters, divisions, and subjects assigned to this teacher only
    const [teacherAssignments] = await pool.query(
      `SELECT DISTINCT stream, year, semester, division, subject
       FROM teacher_details_db 
       WHERE teacher_id = ?
       ORDER BY 
         CASE 
           WHEN stream = 'BSCIT' THEN 1
           WHEN stream = 'BSCDS' THEN 2
           ELSE 3
         END, 
         year, 
         semester`,
      [teacherId],
    );

    // Extract unique values for each field
    const uniqueStreams = [...new Set(teacherAssignments.map((a) => a.stream))];
    const uniqueYears = [...new Set(teacherAssignments.map((a) => a.year))];
    const uniqueSemesters = [
      ...new Set(teacherAssignments.map((a) => a.semester)),
    ];

    // Split comma-separated divisions and get unique values
    const uniqueDivisions = [
      ...new Set(
        teacherAssignments
          .map((a) => a.division)
          .flatMap((div) => div.split(",").map((d) => d.trim().toUpperCase()))
          .filter((d) => d.length > 0),
      ),
    ].sort();

    // Extract unique subjects from all assignments
    const uniqueSubjects = [
      ...new Set(
        teacherAssignments
          .map((a) => a.subject)
          .filter((s) => s && s.trim().length > 0)
          .map((s) => s.trim()),
      ),
    ].sort();

    return res.json({
      ...stats,
      teacherInfo: {
        id: teacherInfo.teacher_id,
        name: teacherInfo.name,
        subject: teacherInfo.subject,
        stream: teacherInfo.stream,
      },
      streams: uniqueStreams,
      years: uniqueYears,
      semesters: uniqueSemesters,
      divisions: uniqueDivisions,
      subjects: uniqueSubjects,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getStreamsAndDivisions(req, res, next) {
  try {
    // Get distinct streams from student records
    const [streamsList] = await pool.query(
      `SELECT DISTINCT stream FROM student_details_db 
       WHERE stream IS NOT NULL AND stream != ''
       ORDER BY 
         CASE 
           WHEN stream = 'BSCIT' THEN 1
           WHEN stream = 'BSCDS' THEN 2
           ELSE 3
         END`,
    );

    // Get distinct divisions from student records
    const [divisionsList] = await pool.query(
      `SELECT DISTINCT division FROM student_details_db 
       WHERE division IS NOT NULL AND division != ''
       ORDER BY division`,
    );

    // Split comma-separated divisions and get unique values
    const uniqueDivisions = [
      ...new Set(
        divisionsList
          .map((d) => d.division)
          .flatMap((div) => div.split(",").map((d) => d.trim().toUpperCase()))
          .filter((d) => d.length > 0),
      ),
    ].sort();

    return res.json({
      streams: streamsList.map((s) => s.stream),
      divisions: uniqueDivisions,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getSubjectsForClass(req, res, next) {
  try {
    const teacherId = req.session.user.id;
    const { year, stream, division, semester } = req.query;

    if (!year || !stream || !division) {
      return res.status(400).json({
        message: "Year, stream, and division are required",
      });
    }

    // Semester is already in "Sem X" format from frontend
    const semesterFilter = semester || null;

    // Get subjects taught by this teacher for the specific year/stream/division/semester
    // Split comma-separated divisions to match individual divisions
    const [subjects] = await pool.query(
      `SELECT DISTINCT subject
       FROM teacher_details_db
       WHERE teacher_id = ?
       AND year = ?
       AND stream = ?
       AND (
         division = ? 
         OR FIND_IN_SET(?, REPLACE(division, ' ', ''))
       )
       ${semester ? "AND semester = ?" : ""}
       ORDER BY subject`,
      semester
        ? [teacherId, year, stream, division, division, semesterFilter]
        : [teacherId, year, stream, division, division],
    );

    return res.json({
      subjects: subjects.map((s) => s.subject),
    });
  } catch (error) {
    return next(error);
  }
}

export async function mappedStudents(req, res, next) {
  try {
    const teacherId = req.session.user.id;
    const students = await getMappedStudents(teacherId);
    return res.json({ students });
  } catch (error) {
    return next(error);
  }
}

export async function startAttendance(req, res, next) {
  try {
    const teacherId = req.session.user.id;
    const { subject, year, semester, division, stream } = req.body;

    if (!subject || !year || !semester || !division || !stream) {
      return res.status(400).json({
        message: "Subject, year, semester, division, and stream are required",
      });
    }

    // Get students strictly filtered by Year, Semester, Stream, Division, and Subject
    const students = await getMappedStudents(teacherId, {
      subject,
      year,
      semester,
      stream,
      division,
    });

    if (!students.length) {
      return res
        .status(404)
        .json({ message: "No students found for this class combination" });
    }

    const sessionId = await createAttendanceSession({
      teacherId,
      subject,
      year,
      semester,
      division,
      stream,
    });

    await buildActivityPayload("START_ATTENDANCE", teacherId, {
      sessionId,
      subject,
      year,
      semester,
      division,
      stream,
    });

    return res.json({
      message: "Attendance session started",
      sessionId,
      students,
    });
  } catch (error) {
    return next(error);
  }
}

export async function endAttendance(req, res, next) {
  try {
    const teacherId = req.session.user.id;
    const { sessionId, subject, year, semester, stream, division, attendance } =
      req.body;

    if (!sessionId || !Array.isArray(attendance) || !attendance.length) {
      return res
        .status(400)
        .json({ message: "Session ID and attendance list are required" });
    }

    const formatted = attendance.map((item) => ({
      studentId: item.studentId,
      status: item.status === "P" ? "P" : "A",
    }));

    const summary = await finalizeAttendanceSession(
      sessionId,
      teacherId,
      formatted,
    );

    await logAttendanceToAggregate(formatted, {
      sessionId,
      teacherId,
      subject,
      year,
      semester,
      stream,
      division,
      sessionDate: new Date(),
    });

    await buildActivityPayload("END_ATTENDANCE", teacherId, {
      sessionId,
      subject,
      year,
      division,
      stream,
      present: summary.present,
      absent: summary.absent,
    });

    // Get teacher name for Excel file
    const [teacherInfo] = await pool.query(
      `SELECT name FROM teacher_details_db WHERE teacher_id = ?`,
      [teacherId],
    );
    const teacherName = teacherInfo?.[0]?.name || "Teacher";

    // Save session to attendance_backup table for history with CSV file
    const startedAt = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const datePart = `${pad(startedAt.getDate())}-${pad(startedAt.getMonth() + 1)}-${startedAt.getFullYear()}`;
    const timePart = `${pad(startedAt.getHours())}-${pad(startedAt.getMinutes())}-${pad(startedAt.getSeconds())}`;
    const subjectPart = (subject || "session")
      .replace(/[^a-z0-9-_ ]/gi, "")
      .replace(/\s+/g, "_");
    const filename = `${datePart}_${timePart}_${subjectPart}_attendance_record.csv`;

    // Get student details for records
    const studentIds = formatted.map((f) => f.studentId);
    const placeholders = studentIds.map(() => "?").join(",");
    const [students] = await pool.query(
      `SELECT student_id, student_name, roll_no FROM student_details_db WHERE student_id IN (${placeholders}) ORDER BY 
        CASE 
          WHEN stream = 'BSCIT' THEN 1
          WHEN stream = 'BSCDS' THEN 2
          ELSE 3
        END,
        student_id ASC, 
        roll_no ASC`,
      studentIds,
    );

    // Build records array with student details in ascending order by roll number
    const studentRecords = students.map((student) => {
      const attendanceItem = formatted.find(
        (item) => item.studentId === student.student_id,
      );
      return {
        rollNo: student.roll_no || "",
        studentId: student.student_id,
        name: student.student_name || "Unknown",
        status: attendanceItem?.status || "A",
      };
    });

    // Generate CSV content
    const csvRows = [];

    // College header
    csvRows.push(
      '"Sheth N.K.T.T. College of Commerce & Sheth J.T.T. College of Arts (Autonomous) Thane West - 400601"',
    );
    csvRows.push(""); // Empty row
    csvRows.push('"Attendance Report"');
    csvRows.push(""); // Empty row

    // Session metadata
    csvRows.push(`"Session ID:","${sessionId || ""}"`);
    csvRows.push(`"Subject:","${subject || ""}"`);
    csvRows.push(`"Year:","${year || ""}"`);
    csvRows.push(`"Semester:","${semester || ""}"`);
    csvRows.push(`"Stream:","${stream || ""}"`);
    csvRows.push(`"Division:","${division || ""}"`);
    csvRows.push(`"Teacher:","${teacherName}"`);
    csvRows.push(`"Date & Time:","${startedAt.toLocaleString()}"`);
    csvRows.push(`"Present:","${summary.present || 0}"`);
    csvRows.push(`"Absent:","${summary.absent || 0}"`);
    csvRows.push(""); // Empty row

    // Student attendance header
    csvRows.push('"Roll No","Student ID","Name","Status"');

    // Student rows
    studentRecords.forEach((student) => {
      const isPresent = student.status === "P";
      const rollNo = (student.rollNo || "").toString().replace(/"/g, '""');
      const studentId = (student.studentId || "")
        .toString()
        .replace(/"/g, '""');
      const name = (student.name || "").toString().replace(/"/g, '""');
      const status = isPresent ? "Present" : "Absent";

      csvRows.push(`"${rollNo}","${studentId}","${name}","${status}"`);
    });

    const csvContent = csvRows.join("\n");
    const fileContent = Buffer.from(csvContent).toString("base64");

    // Save to database with file content
    await pool.query(
      `INSERT INTO attendance_backup 
        (filename, session_id, teacher_id, subject, year, semester, stream, division, started_at, records, file_content, saved_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        filename,
        sessionId,
        teacherId,
        subject,
        year,
        semester,
        stream,
        division,
        startedAt,
        JSON.stringify(studentRecords),
        fileContent,
      ],
    );

    // Send real-time notification
    notificationService.notifyAttendanceMarked({
      teacherId,
      teacherName,
      subject,
      year,
      stream,
      division,
      present: summary.present,
      absent: summary.absent,
      total: summary.present + summary.absent,
      sessionId,
    });

    return res.json({
      message: "Attendance recorded",
      summary,
    });
  } catch (error) {
    return next(error);
  }
}

export async function manualAttendance(req, res, next) {
  try {
    const teacherId = req.session.user.id;
    const { studentId, status, reason } = req.body;

    if (!studentId || !status) {
      return res
        .status(400)
        .json({ message: "Student ID and status are required" });
    }

    await pool.query(
      `INSERT INTO manual_overrides 
        (teacher_id, student_id, status, reason, timestamp) 
       VALUES (?, ?, ?, ?, NOW())`,
      [teacherId, studentId, status === "P" ? "P" : "A", reason || null],
    );

    await buildActivityPayload("MANUAL_OVERRIDE", teacherId, {
      studentId,
      status,
      reason,
    });

    return res.json({ message: "Manual attendance override saved" });
  } catch (error) {
    return next(error);
  }
}

export async function teacherActivityLog(req, res, next) {
  try {
    const teacherId = req.session.user.id;

    const [rows] = await pool.query(
      `SELECT action, details, created_at
       FROM activity_logs
       WHERE actor_role = 'teacher' AND actor_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [teacherId],
    );

    return res.json({ activity: rows });
  } catch (error) {
    return next(error);
  }
}

export async function getStudentsPresent(req, res, next) {
  try {
    const teacherId = req.session.user.id;

    // Get all students mapped to this teacher
    const students = await getMappedStudents(teacherId);

    res.json({ students });
  } catch (error) {
    next(error);
  }
}

export async function getSubjectSessions(req, res, next) {
  try {
    const teacherId = req.session.user.id;

    // Get subject session breakdown by class for this teacher
    const [subjectSessions] = await pool.query(
      `SELECT 
         s.subject,
         s.year,
         s.semester,
         s.stream,
         s.division,
         COUNT(DISTINCT s.session_id) as session_count,
         SUM(s.present_count) as total_present,
         SUM(s.absent_count) as total_absent,
         ROUND(
           CASE 
             WHEN (SUM(s.present_count) + SUM(s.absent_count)) > 0 
             THEN (SUM(s.present_count) * 100.0 / (SUM(s.present_count) + SUM(s.absent_count)))
             ELSE 0 
           END, 2
         ) as attendance_percentage
       FROM attendance_sessions s
       WHERE s.teacher_id = ?
         AND s.subject IS NOT NULL
         AND s.year IS NOT NULL
         AND s.stream IS NOT NULL
         AND s.division IS NOT NULL
       GROUP BY s.subject, s.year, s.semester, s.stream, s.division
       ORDER BY s.year, s.semester, 
         CASE 
           WHEN s.stream = 'BSCIT' THEN 1
           WHEN s.stream = 'BSCDS' THEN 2
           ELSE 3
         END, 
         s.division, 
         s.subject`,
      [teacherId]
    );

    res.json({ subjectSessions });
  } catch (error) {
    next(error);
  }
}

export async function saveAttendanceBackup(req, res, next) {
  try {
    const teacherId = req.session.user.id;
    const {
      filename,
      fileContent,
      sessionId,
      subject,
      year,
      semester,
      stream,
      division,
      startedAt,
      attendance,
    } = req.body;

    if (!filename) {
      return res.status(400).json({ message: "Filename is required" });
    }

    await pool.query(
      `INSERT INTO attendance_backup 
        (filename, session_id, teacher_id, subject, year, semester, stream, division, started_at, records, file_content, saved_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        filename,
        sessionId || null,
        teacherId,
        subject || null,
        year || null,
        semester || null,
        stream || null,
        division || null,
        startedAt ? new Date(startedAt) : null,
        JSON.stringify(attendance || []),
        fileContent || null,
      ],
    );

    // log backup action
    await buildActivityPayload("BACKUP_ATTENDANCE", teacherId, {
      filename,
      sessionId,
    });

    return res.json({ message: "Backup saved" });
  } catch (error) {
    return next(error);
  }
}

export async function getAttendanceHistory(req, res, next) {
  try {
    const teacherId = req.session.user.id;

    const [rows] = await pool.query(
      `SELECT id, filename, session_id, subject, year, stream, division, started_at, saved_at
       FROM attendance_backup
       WHERE teacher_id = ?
       ORDER BY saved_at DESC
       LIMIT 100`,
      [teacherId],
    );

    return res.json({ history: rows });
  } catch (error) {
    return next(error);
  }
}

export async function downloadAttendanceBackup(req, res, next) {
  try {
    const teacherId = req.session.user.id;
    const backupId = req.params.id;

    const [backup] = await pool.query(
      `SELECT filename, session_id, subject, year, semester, stream, division, started_at, records, teacher_id
       FROM attendance_backup 
       WHERE id = ? AND teacher_id = ?`,
      [backupId, teacherId],
    );

    if (!backup || !Array.isArray(backup) || backup.length === 0) {
      return res.status(404).json({ message: "Backup not found" });
    }

    const record = backup[0];

    // Parse the records JSON to get student details
    let students = [];
    try {
      students = JSON.parse(record.records || "[]");
    } catch (err) {
      console.error("Failed to parse records:", err);
      return res.status(500).json({ message: "Invalid backup data" });
    }

    // Get teacher name
    const [teacherInfo] = await pool.query(
      `SELECT name FROM teacher_details_db WHERE teacher_id = ?`,
      [teacherId],
    );
    const teacherName = teacherInfo?.[0]?.name || "Teacher";

    // Calculate summary
    const present = students.filter((s) => s.status === "P").length;
    const absent = students.filter((s) => s.status === "A").length;

    // Create Excel workbook with ExcelJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Attendance Report");

    // Set column widths
    worksheet.columns = [
      { width: 12 }, // Roll No
      { width: 15 }, // Student ID
      { width: 30 }, // Name
      { width: 12 }, // Status
    ];

    // Add college header (merged across all columns)
    worksheet.mergeCells("A1:D1");
    const headerCell = worksheet.getCell("A1");
    headerCell.value =
      "Sheth N.K.T.T. College of Commerce & Sheth J.T.T. College of Arts (Autonomous) Thane West - 400601";
    headerCell.font = { bold: true, size: 12 };
    headerCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(1).height = 30;

    // Add title (merged across all columns)
    worksheet.mergeCells("A3:D3");
    const titleCell = worksheet.getCell("A3");
    titleCell.value = "Attendance Report";
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(3).height = 25;

    // Add session metadata
    let currentRow = 5;
    const metadata = [
      ["Session ID:", record.session_id || ""],
      ["Subject:", record.subject || ""],
      ["Year:", record.year || ""],
      ["Semester:", record.semester || ""],
      ["Stream:", record.stream || ""],
      ["Division:", record.division || ""],
      ["Teacher:", teacherName],
      [
        "Date & Time:",
        record.started_at ? new Date(record.started_at).toLocaleString() : "",
      ],
      ["Present:", present.toString()],
      ["Absent:", absent.toString()],
    ];

    metadata.forEach((meta) => {
      const row = worksheet.getRow(currentRow);
      row.getCell(1).value = meta[0];
      row.getCell(1).font = { bold: true };
      row.getCell(2).value = meta[1];
      currentRow++;
    });

    currentRow++; // Empty row

    // Add student attendance header
    const headerRow = worksheet.getRow(currentRow);
    headerRow.values = ["Roll No", "Student ID", "Name", "Status"];
    headerRow.font = { bold: true, size: 11 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD3D3D3" },
    };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    currentRow++;

    // Add student rows with color coding
    students.forEach((student) => {
      const isPresent = student.status === "P";
      const row = worksheet.getRow(currentRow);

      row.values = [
        student.rollNo || "",
        student.studentId || "",
        student.name || "",
        isPresent ? "Present" : "Absent",
      ];

      // Apply color based on status
      const fillColor = isPresent
        ? { argb: "FFD4EDDA" } // Light green for present
        : { argb: "FFF8D7DA" }; // Light red for absent

      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: fillColor,
        };
        cell.alignment = { vertical: "middle" };
      });

      // Make status cell bold with appropriate color
      row.getCell(4).font = {
        bold: true,
        color: { argb: isPresent ? "FF28A745" : "FFDC3545" },
      };
      row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };

      currentRow++;
    });

    // Add borders to all cells in the student table
    const tableStartRow = currentRow - students.length - 1;
    const tableEndRow = currentRow - 1;
    for (let row = tableStartRow; row <= tableEndRow; row++) {
      for (let col = 1; col <= 4; col++) {
        const cell = worksheet.getRow(row).getCell(col);
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      }
    }

    // Generate Excel file and send as response
    const excelFilename = record.filename.replace(/\.csv$/i, ".xlsx");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${excelFilename}"`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return next(error);
  }
}

export async function viewAttendanceBackup(req, res, next) {
  try {
    const teacherId = req.session.user.id;
    const backupId = req.params.id;

    const [backup] = await pool.query(
      `SELECT filename, session_id, subject, year, semester, stream, division, started_at, records, file_content 
       FROM attendance_backup 
       WHERE id = ? AND teacher_id = ?`,
      [backupId, teacherId],
    );

    if (!backup || !Array.isArray(backup) || backup.length === 0) {
      return res.status(404).json({ message: "Backup not found" });
    }

    const record = backup[0];

    // Parse the records JSON to get student details
    let students = [];
    try {
      students = JSON.parse(record.records || "[]");
    } catch (err) {
      console.error("Failed to parse records:", err);
    }

    // Get teacher name
    const [teacherInfo] = await pool.query(
      `SELECT name FROM teacher_details_db WHERE teacher_id = ?`,
      [teacherId],
    );
    const teacherName = teacherInfo?.[0]?.name || "Teacher";

    // Calculate summary
    const present = students.filter((s) => s.status === "P").length;
    const absent = students.filter((s) => s.status === "A").length;

    return res.json({
      sessionInfo: {
        sessionId: record.session_id,
        filename: record.filename,
        subject: record.subject,
        year: record.year,
        semester: record.semester,
        stream: record.stream,
        division: record.division,
        teacher: teacherName,
        startedAt: record.started_at,
        present,
        absent,
        total: present + absent,
      },
      students,
    });
  } catch (error) {
    return next(error);
  }
}

export async function deleteAttendanceBackup(req, res, next) {
  try {
    console.log("🗑️  DELETE request received for backup:", req.params.id);
    console.log("   Teacher ID:", req.session?.user?.id);

    const teacherId = req.session.user.id;
    const backupId = req.params.id;

    // First verify the backup belongs to this teacher
    const [backup] = await pool.query(
      `SELECT id FROM attendance_backup WHERE id = ? AND teacher_id = ?`,
      [backupId, teacherId],
    );

    console.log("   Backup found:", backup?.length > 0 ? "YES" : "NO");

    if (!backup || !Array.isArray(backup) || backup.length === 0) {
      return res.status(404).json({ message: "Backup not found" });
    }

    // Delete the backup
    await pool.query(
      `DELETE FROM attendance_backup WHERE id = ? AND teacher_id = ?`,
      [backupId, teacherId],
    );

    console.log("   ✅ Backup deleted successfully");

    return res.json({
      message: "Attendance history deleted successfully",
      success: true,
    });
  } catch (error) {
    console.error("   ❌ Delete error:", error.message);
    return next(error);
  }
}

export async function removeAttendanceHistory(req, res, next) {
  try {
    console.log("🗑️  REMOVE request received");
    console.log("   Request body:", req.body);
    console.log("   Teacher ID:", req.session?.user?.id);

    const teacherId = req.session.user.id;
    const { backupId } = req.body;

    if (!backupId) {
      return res.status(400).json({ message: "Backup ID is required" });
    }

    console.log("   Attempting to delete backup ID:", backupId);

    // First verify the backup belongs to this teacher
    const [backup] = await pool.query(
      `SELECT id FROM attendance_backup WHERE id = ? AND teacher_id = ?`,
      [backupId, teacherId],
    );

    console.log("   Backup found:", backup?.length > 0 ? "YES" : "NO");

    if (!backup || !Array.isArray(backup) || backup.length === 0) {
      return res
        .status(404)
        .json({ message: "Backup not found or does not belong to you" });
    }

    // Delete the backup
    const [result] = await pool.query(
      `DELETE FROM attendance_backup WHERE id = ? AND teacher_id = ?`,
      [backupId, teacherId],
    );

    console.log(
      "   ✅ Backup deleted successfully. Rows affected:",
      result.affectedRows,
    );

    return res.json({
      message: "Attendance history deleted successfully",
      success: true,
      deletedId: backupId,
    });
  } catch (error) {
    console.error("   ❌ Remove error:", error.message);
    console.error("   Stack:", error.stack);
    return next(error);
  }
}

export async function exportAttendanceExcel(req, res, next) {
  try {
    const teacherId = req.session.user.id;
    const {
      sessionId,
      subject,
      year,
      semester,
      stream,
      division,
      startedAt,
      teacherName,
      summary,
      students,
    } = req.body;

    if (!students || !Array.isArray(students)) {
      return res.status(400).json({ message: "Students data is required" });
    }

    // Create Excel workbook with ExcelJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Attendance Report");

    // Set column widths
    worksheet.columns = [
      { width: 12 }, // Roll No
      { width: 15 }, // Student ID
      { width: 30 }, // Name
      { width: 12 }, // Status
    ];

    // Add college header (merged across all columns)
    worksheet.mergeCells("A1:D1");
    const headerCell = worksheet.getCell("A1");
    headerCell.value =
      "Sheth N.K.T.T. College of Commerce & Sheth J.T.T. College of Arts (Autonomous) Thane West - 400601";
    headerCell.font = { bold: true, size: 12 };
    headerCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(1).height = 30;

    // Add title (merged across all columns)
    worksheet.mergeCells("A3:D3");
    const titleCell = worksheet.getCell("A3");
    titleCell.value = "Attendance Report";
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(3).height = 25;

    // Add session metadata
    let currentRow = 5;
    const metadata = [
      ["Session ID:", sessionId || ""],
      ["Subject:", subject || ""],
      ["Year:", year || ""],
      ["Semester:", semester || ""],
      ["Stream:", stream || ""],
      ["Division:", division || ""],
      ["Teacher:", teacherName || ""],
      ["Date & Time:", startedAt ? new Date(startedAt).toLocaleString() : ""],
      ["Present:", (summary?.present || 0).toString()],
      ["Absent:", (summary?.absent || 0).toString()],
    ];

    metadata.forEach((meta) => {
      const row = worksheet.getRow(currentRow);
      row.getCell(1).value = meta[0];
      row.getCell(1).font = { bold: true };
      row.getCell(2).value = meta[1];
      currentRow++;
    });

    currentRow++; // Empty row

    // Add student attendance header
    const headerRow = worksheet.getRow(currentRow);
    headerRow.values = ["Roll No", "Student ID", "Name", "Status"];
    headerRow.font = { bold: true, size: 11 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD3D3D3" },
    };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    currentRow++;

    // Add student rows with color coding
    students.forEach((student) => {
      const isPresent = student.status === "P";
      const row = worksheet.getRow(currentRow);

      row.values = [
        student.rollNo || "",
        student.studentId || "",
        student.name || "",
        isPresent ? "Present" : "Absent",
      ];

      // Apply color based on status
      const fillColor = isPresent
        ? { argb: "FFD4EDDA" } // Light green for present
        : { argb: "FFF8D7DA" }; // Light red for absent

      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: fillColor,
        };
        cell.alignment = { vertical: "middle" };
      });

      // Make status cell bold with appropriate color
      row.getCell(4).font = {
        bold: true,
        color: { argb: isPresent ? "FF28A745" : "FFDC3545" },
      };
      row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };

      currentRow++;
    });

    // Add borders to all cells in the student table
    const tableStartRow = currentRow - students.length - 1;
    const tableEndRow = currentRow - 1;
    for (let row = tableStartRow; row <= tableEndRow; row++) {
      for (let col = 1; col <= 4; col++) {
        const cell = worksheet.getRow(row).getCell(col);
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      }
    }

    // Generate filename
    const timestamp = new Date(startedAt || Date.now())
      .toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
      .replace(/[/:]/g, "-")
      .replace(", ", "_");

    const subjectName = (subject || "session").replace(/[^a-z0-9_]/gi, "_");
    const filename = `${timestamp}_${subjectName}_attendance_record.xlsx`;

    // Set proper headers for Excel file download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Send Excel content
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Excel export error:", error);
    return next(error);
  }
}

// Teacher Defaulter List Functions

export async function teacherGetDefaulterList(req, res, next) {
  try {
    const teacherId = req.session.user.id;
    const {
      month,
      year,
      stream: queryStream,
      division,
      type = "monthly",
      threshold = 75,
      start_date,
      end_date,
    } = req.query;

    // Get teacher's details to fall back to their assigned stream
    const [teacher] = await pool.query(
      `SELECT stream, subject FROM teacher_details_db WHERE teacher_id = ?`,
      [teacherId],
    );

    if (!teacher || teacher.length === 0) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    const filterStream = queryStream || teacher[0].stream;
    // NOTE: We no longer filter by subject - we want overall attendance across ALL subjects

    let defaulters;
    if (type === "overall") {
      defaulters = await defaulterService.getOverallDefaulters({
        stream: filterStream,
        division,
        year,
        teacherId: teacherId, // Pass teacherId to filter based on mappings
        threshold: parseFloat(threshold),
      });
    } else {
      defaulters = await defaulterService.getDefaulterList({
        month: month ? parseInt(month) : undefined,
        year: year ? parseInt(year) : undefined,
        stream: filterStream,
        division,
        teacherId: teacherId, // Pass teacherId to filter based on mappings
        threshold: parseFloat(threshold),
        start_date,
        end_date,
      });
    }

    // ── Auto-save to Defaulter_History_Lists on every view (non-fatal) ──────
    try {
      const [tRows] = await pool.query(
        `SELECT name FROM teacher_details_db WHERE teacher_id = ? LIMIT 1`,
        [teacherId],
      );
      const teacherName = tRows?.[0]?.name || null;
      const parts = [];
      if (year) parts.push(`Year: ${year}`);
      if (filterStream) parts.push(`Stream: ${filterStream}`);
      if (division) parts.push(`Div: ${division}`);
      if (month) parts.push(`Month: ${month}`);
      parts.push(`Threshold: ${parseFloat(threshold)}%`);
      await pool.query(
        `INSERT INTO Defaulter_History_Lists
           (teacher_id, teacher_name, threshold, year, stream, division, month,
            defaulter_count, filters_summary, defaulters_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          teacherId,
          teacherName,
          parseFloat(threshold),
          year || null,
          filterStream || null,
          division || null,
          month ? parseInt(month) : null,
          defaulters.length,
          parts.join(" | "),
          JSON.stringify(defaulters),
        ],
      );
    } catch (histErr) {
      console.warn("⚠️  Defaulter history save skipped:", histErr.message);
    }

    return res.json({
      defaulters,
      count: defaulters.length,
      threshold: parseFloat(threshold),
    });
  } catch (error) {
    return next(error);
  }
}

export async function teacherDownloadDefaulterList(req, res, next) {
  try {
    const teacherId = req.session.user.id;
    const {
      month,
      year,
      stream,
      division,
      subject,
      type = "monthly",
      threshold = 75,
      start_date,
      end_date,
    } = req.query;

    // Get teacher's details
    const [teacher] = await pool.query(
      `SELECT stream, subject FROM teacher_details_db WHERE teacher_id = ?`,
      [teacherId],
    );

    if (!teacher || teacher.length === 0) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    const teacherStream = teacher[0].stream;

    // Use provided filters or fall back to teacher's assigned values
    const filterStream = stream || teacherStream;
    // NOTE: We no longer filter by subject - we want overall attendance across ALL subjects

    let defaulters;
    if (type === "overall") {
      defaulters = await defaulterService.getOverallDefaulters({
        stream: filterStream,
        division,
        year,
        teacherId: teacherId, // Pass teacherId to filter based on mappings
        threshold: parseFloat(threshold),
      });
    } else {
      defaulters = await defaulterService.getDefaulterList({
        month: month ? parseInt(month) : undefined,
        year: year ? parseInt(year) : undefined,
        stream: filterStream,
        division,
        teacherId: teacherId, // Pass teacherId to filter based on mappings
        threshold: parseFloat(threshold),
        start_date,
        end_date,
      });
    }

    if (defaulters.length === 0) {
      return res.status(404).json({
        message:
          "No defaulters found. This could mean either no students are below the threshold, or no attendance data exists yet.",
      });
    }

    const workbook = await defaulterService.generateDefaulterExcel(defaulters, {
      month: month ? parseInt(month) : undefined,
      year: year ? parseInt(year) : undefined,
      type,
      threshold: parseFloat(threshold),
    });

    // Save to history (non-fatal — schema mismatch in old table won't block export)
    try {
      await defaulterService.saveDefaulterHistory(
        defaulters,
        teacherId,
        "teacher",
      );
    } catch (histErr) {
      console.warn("⚠️  defaulter_history save skipped:", histErr.message);
    }

    // Log activity
    await buildActivityPayload("DOWNLOAD_DEFAULTER_LIST", teacherId, {
      count: defaulters.length,
      threshold: parseFloat(threshold),
      filters: {
        month,
        year,
        stream: filterStream,
        division,
      },
    });

    const filename = `Defaulter_List_${threshold}%_${month || "All"}_${year || new Date().getFullYear()}_${Date.now()}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return next(error);
  }
}

export async function teacherGetAttendanceDates(req, res, next) {
  try {
    const teacherId = req.session.user.id;
    const { month, year } = req.query;

    if (!month || month === "ALL") {
      return res.json({ dates: [] });
    }

    const params = [teacherId];
    let query = `
      SELECT DISTINCT DATE(started_at) as attendance_date
      FROM attendance_sessions
      WHERE teacher_id = ?
        AND MONTH(started_at) = ?
        AND started_at IS NOT NULL
    `;
    params.push(parseInt(month));

    if (year && year !== "ALL") {
      query += ` AND YEAR(started_at) = ?`;
      params.push(parseInt(year));
    }

    query += ` ORDER BY attendance_date ASC`;

    const [rows] = await pool.query(query, params);
    const dates = rows.map(row => row.attendance_date);

    return res.json({ dates });
  } catch (error) {
    console.error("Failed to fetch attendance dates:", error);
    return res.status(500).json({
      message: "Failed to fetch attendance dates",
      error: error.message,
    });
  }
}

// ── Defaulter History ─────────────────────────────────────────────────────────

export async function saveDefaulterHistory(req, res, next) {
  try {
    const teacherId = req.session.user.id;
    const { threshold, year, stream, division, month, defaulters } = req.body;

    if (!Array.isArray(defaulters)) {
      return res.status(400).json({ message: "defaulters must be an array" });
    }

    // Get teacher name
    const [teacherRows] = await pool.query(
      `SELECT name FROM teacher_details_db WHERE teacher_id = ? LIMIT 1`,
      [teacherId],
    );
    const teacherName = teacherRows?.[0]?.name || null;

    // Build a human-readable filter summary
    const parts = [];
    if (year && year !== "ALL") parts.push(`Year: ${year}`);
    if (stream && stream !== "ALL") parts.push(`Stream: ${stream}`);
    if (division && division !== "ALL") parts.push(`Div: ${division}`);
    if (month && month !== "ALL") parts.push(`Month: ${month}`);
    parts.push(`Threshold: ${threshold}%`);
    const filtersSummary = parts.join(" | ");

    const [result] = await pool.query(
      `INSERT INTO Defaulter_History_Lists
         (teacher_id, teacher_name, threshold, year, stream, division, month,
          defaulter_count, filters_summary, defaulters_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        teacherId,
        teacherName,
        parseFloat(threshold) || 75,
        year || null,
        stream || null,
        division || null,
        month ? parseInt(month) : null,
        defaulters.length,
        filtersSummary,
        JSON.stringify(defaulters),
      ],
    );

    return res.json({
      id: result.insertId,
      message: "Defaulter list saved to history",
    });
  } catch (error) {
    return next(error);
  }
}

export async function getDefaulterHistory(req, res, next) {
  try {
    const teacherId = req.session.user.id;

    const [rows] = await pool.query(
      `SELECT id, threshold, year, stream, division, month,
              defaulter_count, filters_summary, created_at
       FROM Defaulter_History_Lists
       WHERE teacher_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
      [teacherId],
    );

    return res.json({ history: rows });
  } catch (error) {
    return next(error);
  }
}

export async function viewDefaulterHistoryEntry(req, res, next) {
  try {
    const teacherId = req.session.user.id;
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM Defaulter_History_Lists WHERE id = ? AND teacher_id = ?`,
      [id, teacherId],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Record not found" });
    }

    const row = rows[0];
    let defaulters = [];
    try {
      defaulters = JSON.parse(row.defaulters_json || "[]");
    } catch (_) { }

    return res.json({ record: row, defaulters });
  } catch (error) {
    return next(error);
  }
}

export async function deleteDefaulterHistoryEntry(req, res, next) {
  try {
    const teacherId = req.session.user.id;
    const { id } = req.params;

    const [result] = await pool.query(
      `DELETE FROM Defaulter_History_Lists WHERE id = ? AND teacher_id = ?`,
      [id, teacherId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Record not found" });
    }

    return res.json({ message: "Defaulter history entry deleted" });
  } catch (error) {
    return next(error);
  }
}

export async function downloadDefaulterHistoryEntry(req, res, next) {
  try {
    const teacherId = req.session.user.id;
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM Defaulter_History_Lists WHERE id = ? AND teacher_id = ?`,
      [id, teacherId],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Record not found" });
    }

    const record = rows[0];
    let defaulters = [];
    try {
      defaulters = JSON.parse(record.defaulters_json || "[]");
    } catch (_) { }

    if (defaulters.length === 0) {
      return res
        .status(404)
        .json({ message: "No defaulters stored in this record" });
    }

    const threshold = parseFloat(record.threshold || 75);
    const workbook = await defaulterService.generateDefaulterExcel(defaulters, {
      month: record.month ? parseInt(record.month) : undefined,
      year: record.year || undefined,
      type: "monthly",
      threshold,
    });

    const filename = `Defaulter_History_${threshold}%_${record.month || "All"}_${record.year || "All"}_${id}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return next(error);
  }
}

// Search for student by ID (teachers can only search their assigned students)
export async function teacherSearchStudent(req, res, next) {
  try {
    const { studentId } = req.params;
    const teacherId = req.session.user.id;

    if (!teacherId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const searchTerm = `%${studentId}%`;
    const trimmedInput = studentId.trim();
    const isSingleLetter = trimmedInput.length === 1 && /^[a-zA-Z]$/.test(trimmedInput);
    const isDigitsOnly = /^\d{1,3}$/.test(trimmedInput);

    // Get student details with attendance summary - search across multiple fields
    // Check if student is assigned to this teacher
    // If single letter, search only division field
    // If 1-3 digits, search only roll_no field
    let query, params;
    
    if (isSingleLetter) {
      query = `SELECT 
        s.student_id,
        s.student_name,
        s.year,
        s.stream,
        s.division,
        s.roll_no,
        COALESCE(SUM(CASE WHEN ar.status = 'P' THEN 1 ELSE 0 END), 0) as attendance_count,
        COUNT(DISTINCT ases.session_id) as total_sessions
      FROM student_details_db s
      INNER JOIN teacher_student_map tsm ON s.student_id = tsm.student_id
      LEFT JOIN attendance_records ar ON s.student_id = ar.student_id
      LEFT JOIN attendance_sessions ases ON ar.session_id = ases.session_id
      WHERE s.division = ?
        AND tsm.teacher_id = ?
      GROUP BY s.student_id
      ORDER BY 
        CASE WHEN s.stream = 'BSCIT' THEN 1 WHEN s.stream = 'BSCDS' THEN 2 ELSE 3 END,
        s.student_id ASC`;
      params = [trimmedInput.toUpperCase(), teacherId];
    } else if (isDigitsOnly) {
      query = `SELECT 
        s.student_id,
        s.student_name,
        s.year,
        s.stream,
        s.division,
        s.roll_no,
        COALESCE(SUM(CASE WHEN ar.status = 'P' THEN 1 ELSE 0 END), 0) as attendance_count,
        COUNT(DISTINCT ases.session_id) as total_sessions
      FROM student_details_db s
      INNER JOIN teacher_student_map tsm ON s.student_id = tsm.student_id
      LEFT JOIN attendance_records ar ON s.student_id = ar.student_id
      LEFT JOIN attendance_sessions ases ON ar.session_id = ases.session_id
      WHERE s.roll_no = ?
        AND tsm.teacher_id = ?
      GROUP BY s.student_id
      ORDER BY 
        CASE WHEN s.stream = 'BSCIT' THEN 1 WHEN s.stream = 'BSCDS' THEN 2 ELSE 3 END,
        s.student_id ASC`;
      params = [trimmedInput, teacherId];
    } else {
      query = `SELECT 
        s.student_id,
        s.student_name,
        s.year,
        s.stream,
        s.division,
        s.roll_no,
        COALESCE(SUM(CASE WHEN ar.status = 'P' THEN 1 ELSE 0 END), 0) as attendance_count,
        COUNT(DISTINCT ases.session_id) as total_sessions
      FROM student_details_db s
      INNER JOIN teacher_student_map tsm ON s.student_id = tsm.student_id
      LEFT JOIN attendance_records ar ON s.student_id = ar.student_id
      LEFT JOIN attendance_sessions ases ON ar.session_id = ases.session_id
      WHERE (s.student_id LIKE ? 
        OR s.student_name LIKE ?
        OR s.roll_no LIKE ?
        OR s.year LIKE ?
        OR s.stream LIKE ?
        OR s.division LIKE ?)
        AND tsm.teacher_id = ?
      GROUP BY s.student_id
      ORDER BY 
        CASE WHEN s.stream = 'BSCIT' THEN 1 WHEN s.stream = 'BSCDS' THEN 2 ELSE 3 END,
        s.student_id ASC`;
      params = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, teacherId];
    }

    const [students] = await pool.query(query, params);

    if (!students || students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No student found matching your search or not assigned to you'
      });
    }

    // If multiple results, return array; if single result, return single object
    return res.json({
      success: true,
      data: students.length === 1 ? students[0] : students,
      count: students.length
    });
  } catch (error) {
    console.error('Teacher search student error:', error);
    return next(error);
  }
}

// Get student session attendance details (teacher access)
export async function getTeacherStudentSessionAttendance(req, res, next) {
  try {
    const { studentId } = req.params;
    const teacherId = req.session.user.id;

    console.log(`[Teacher Sessions] Teacher ${teacherId} requesting sessions for student ${studentId}`);

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: 'Student ID is required'
      });
    }

    // Verify student is assigned to this teacher
    const [mapping] = await pool.query(
      `SELECT * FROM teacher_student_map WHERE teacher_id = ? AND student_id = ?`,
      [teacherId, studentId]
    );

    if (!mapping || mapping.length === 0) {
      console.log(`[Teacher Sessions] Access denied - student ${studentId} not assigned to teacher ${teacherId}`);
      return res.status(403).json({
        success: false,
        message: 'Access denied. Student not assigned to you.'
      });
    }

    // Get all attendance sessions for the student
    const [sessions] = await pool.query(
      `SELECT 
        s.student_id,
        s.student_name,
        s.roll_no,
        s.year,
        s.stream,
        s.division,
        ases.started_at as date,
        COALESCE(ar.status, 'A') as status,
        t.name as teacher,
        ases.subject
      FROM student_details_db s
      CROSS JOIN attendance_sessions ases
      LEFT JOIN attendance_records ar ON s.student_id = ar.student_id AND ar.session_id = ases.session_id
      LEFT JOIN teacher_details_db t ON ases.teacher_id = t.teacher_id AND ases.subject = t.subject
      WHERE s.student_id = ?
        AND ases.year = s.year
        AND ases.stream = s.stream
        AND FIND_IN_SET(s.division, ases.division) > 0
      ORDER BY ases.started_at DESC`,
      [studentId]
    );

    console.log(`[Teacher Sessions] Found ${sessions.length} session records for student ${studentId}`);

    return res.json({
      success: true,
      data: sessions
    });
  } catch (error) {
    console.error('[Teacher Sessions] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching session attendance data',
      error: error.message
    });
  }
}
