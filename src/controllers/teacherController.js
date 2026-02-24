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

    // Get streams, years, semesters, and divisions assigned to this teacher only
    const [teacherAssignments] = await pool.query(
      `SELECT DISTINCT stream, year, semester, division 
       FROM teacher_details_db 
       WHERE teacher_id = ?
       ORDER BY stream, year, semester`,
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
       ORDER BY stream`,
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

    // Convert semester to database format (e.g., "1" -> "Sem 1")
    const semesterFilter = semester ? `Sem ${semester}` : null;

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

    const students = await getMappedStudents(teacherId);
    if (!students.length) {
      return res
        .status(404)
        .json({ message: "No students mapped to this teacher yet" });
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
      `SELECT student_id, student_name, roll_no FROM student_details_db WHERE student_id IN (${placeholders}) ORDER BY student_id ASC`,
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
      `SELECT filename, file_content 
       FROM attendance_backup 
       WHERE id = ? AND teacher_id = ?`,
      [backupId, teacherId],
    );

    if (!backup || !Array.isArray(backup) || backup.length === 0) {
      return res.status(404).json({ message: "Backup not found" });
    }

    if (!backup[0].file_content) {
      return res.status(404).json({ message: "File content not found" });
    }

    let csvContent;
    try {
      // Try to decode as base64 first
      csvContent = Buffer.from(backup[0].file_content, "base64").toString(
        "utf-8",
      );
      
      // Verify it's valid CSV by checking if it starts with expected content
      // If decoded content looks like base64 gibberish, it might already be plain text
      if (!csvContent.includes('"') && !csvContent.includes(',') && backup[0].file_content.includes(',')) {
        // The original was probably already plain text
        csvContent = backup[0].file_content;
      }
    } catch (err) {
      // If base64 decoding fails, assume it's already plain text
      csvContent = backup[0].file_content;
    }

    // Set headers for CSV file
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${backup[0].filename}"`,
    );
    return res.send(csvContent);
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
    csvRows.push(`"Teacher:","${teacherName || ""}"`);
    csvRows.push(
      `"Date & Time:","${startedAt ? new Date(startedAt).toLocaleString() : ""}"`,
    );
    csvRows.push(`"Present:","${summary?.present || 0}"`);
    csvRows.push(`"Absent:","${summary?.absent || 0}"`);
    csvRows.push(""); // Empty row

    // Student attendance header
    csvRows.push('"Roll No","Student ID","Name","Status"');

    // Student rows
    students.forEach((student) => {
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
    const filename = `${timestamp}_${subjectName}_attendance_record.csv`;

    // Set proper headers for CSV file download
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Send CSV content
    res.send(csvContent);
  } catch (error) {
    console.error("CSV export error:", error);
    return next(error);
  }
}

// Teacher Defaulter List Functions

export async function teacherGetDefaulterList(req, res, next) {
  try {
    const teacherId = req.session.user.id;
    const { month, year, type = "monthly", threshold = 75 } = req.query;

    // Get teacher's details to filter by their stream/subject
    const [teacher] = await pool.query(
      `SELECT stream, subject FROM teacher_details_db WHERE teacher_id = ?`,
      [teacherId],
    );

    if (!teacher || teacher.length === 0) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    const { stream, subject } = teacher[0];

    let defaulters;
    if (type === "overall") {
      defaulters = await defaulterService.getOverallDefaulters({
        stream,
        subject,
        threshold: parseFloat(threshold),
      });
    } else {
      defaulters = await defaulterService.getDefaulterList({
        month: month ? parseInt(month) : undefined,
        year: year ? parseInt(year) : undefined,
        stream,
        subject,
        threshold: parseFloat(threshold),
      });
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
    const teacherSubject = teacher[0].subject;

    // Use provided filters or fall back to teacher's assigned values
    const filterStream = stream || teacherStream;
    const filterSubject = subject || teacherSubject;

    let defaulters;
    if (type === "overall") {
      defaulters = await defaulterService.getOverallDefaulters({
        stream: filterStream,
        division,
        year,
        subject: filterSubject,
        threshold: parseFloat(threshold),
      });
    } else {
      defaulters = await defaulterService.getDefaulterList({
        month: month ? parseInt(month) : undefined,
        year: year ? parseInt(year) : undefined,
        stream: filterStream,
        division,
        subject: filterSubject,
        threshold: parseFloat(threshold),
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

    // Save to history
    await defaulterService.saveDefaulterHistory(
      defaulters,
      teacherId,
      "teacher",
    );

    // Log activity
    await buildActivityPayload("DOWNLOAD_DEFAULTER_LIST", teacherId, {
      count: defaulters.length,
      threshold: parseFloat(threshold),
      filters: {
        month,
        year,
        stream: filterStream,
        division,
        subject: filterSubject,
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
