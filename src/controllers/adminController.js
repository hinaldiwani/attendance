import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";

import pool from "../../config/db.js";
import defaulterService from "../services/defaulterService.js";
import notificationService from "../services/notificationService.js";

import {
  parseStudentImport,
  parseTeacherImport,
  upsertStudents,
  upsertTeachers,
  upsertMappings,
  getRecentImportActivity,
  autoMapStudentsToTeachers,
} from "../services/adminService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

function ensureImportSession(req) {
  if (!req.session.importQueue) {
    req.session.importQueue = {
      students: [],
      teachers: [],
    };
  }
  return req.session.importQueue;
}

export async function handleStudentImport(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Upload file is required" });
    }

    const students = parseStudentImport(req.file.path).filter(
      (row) => row.studentId,
    );
    const queue = ensureImportSession(req);
    queue.students = students;

    return res.json({
      message: "Student file processed successfully",
      total: students.length,
      preview: students,
    });
  } catch (error) {
    return next(error);
  } finally {
    if (req.file) {
      fs.rm(req.file.path, { force: true }, () => { });
    }
  }
}

export async function handleTeacherImport(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Upload file is required" });
    }

    const teachers = parseTeacherImport(req.file.path).filter(
      (row) => row.teacherId,
    );
    const queue = ensureImportSession(req);
    queue.teachers = teachers;

    return res.json({
      message: "Teacher file processed successfully",
      total: teachers.length,
      preview: teachers,
    });
  } catch (error) {
    return next(error);
  } finally {
    if (req.file) {
      fs.rm(req.file.path, { force: true }, () => { });
    }
  }
}

export async function confirmImport(req, res, next) {
  try {
    const queue = ensureImportSession(req);
    const { mappings = [], clearExisting = false } = req.body;

    console.log(`📦 Starting import: ${queue.students.length} students, ${queue.teachers.length} teachers`);

    const results = {
      students: { inserted: 0 },
      teachers: { inserted: 0 },
      mappings: { inserted: 0 },
      cleared: { students: 0, teachers: 0 },
      errors: [],
    };

    // Clear existing data if requested
    if (clearExisting) {
      console.log("🗑️  Clearing existing data...");
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        // Clear mappings first (foreign key dependency)
        await connection.query("DELETE FROM teacher_student_map");

        if (queue.students.length) {
          const [studentsResult] = await connection.query(
            "DELETE FROM student_details_db",
          );
          results.cleared.students = studentsResult.affectedRows;
          console.log(`   Cleared ${results.cleared.students} existing students`);
        }

        if (queue.teachers.length) {
          const [teachersResult] = await connection.query(
            "DELETE FROM teacher_details_db",
          );
          results.cleared.teachers = teachersResult.affectedRows;
          console.log(`   Cleared ${results.cleared.teachers} existing teachers`);
        }

        await connection.commit();
        console.log("✅ Existing data cleared successfully");
      } catch (error) {
        await connection.rollback();
        console.error("❌ Error clearing data:", error.message);
        throw error;
      } finally {
        connection.release();
      }
    }

    if (queue.students.length) {
      console.log("📚 Importing students...");
      try {
        results.students = await upsertStudents(
          queue.students,
          req.session.user.id,
        );
        console.log(`✅ Imported ${results.students.inserted} students successfully`);
      } catch (error) {
        console.error("❌ Student import error:", error.message);
        results.errors.push({ type: 'students', message: error.message });
        throw error; // Re-throw to stop the import
      }
    }

    if (queue.teachers.length) {
      console.log("👨‍🏫 Importing teachers...");
      try {
        results.teachers = await upsertTeachers(
          queue.teachers,
          req.session.user.id,
        );
        console.log(`✅ Imported ${results.teachers.inserted} teachers successfully`);
      } catch (error) {
        console.error("❌ Teacher import error:", error.message);
        results.errors.push({ type: 'teachers', message: error.message });
        throw error; // Re-throw to stop the import
      }
    }

    // Manual mappings are skipped - autoMapStudentsToTeachers handles all mappings correctly
    // based on year, stream, and division to prevent cross-year mapping issues
    if (Array.isArray(mappings) && mappings.length) {
      console.log(`Skipping ${mappings.length} manual mappings - will be handled by auto-mapping`);
    }

    // Automatically map students to teachers based on year and stream
    if (queue.students.length || queue.teachers.length) {
      console.log("🔗 Auto-mapping students to teachers...");
      try {
        const autoMappingResult = await autoMapStudentsToTeachers(
          req.session.user.id,
        );
        results.autoMappings = autoMappingResult;
        console.log(`✅ Mapped ${autoMappingResult.mapped} student-teacher relationships`);
      } catch (error) {
        console.error("❌ Auto-mapping error:", error.message);
        results.errors.push({ type: 'mapping', message: error.message });
        // Continue even if auto-mapping fails
      }
    }

    req.session.importQueue = { students: [], teachers: [] };

    // Notify about data import
    notificationService.notifyDataImport({
      adminId: req.session.user.id,
      adminName: req.session.user.name,
      studentsCount: results.students.inserted,
      teachersCount: results.teachers.inserted,
      mappingsCount: results.mappings.inserted,
    });

    console.log("✅ Import completed successfully");
    console.log(`   Students: ${results.students.inserted}, Teachers: ${results.teachers.inserted}, Mappings: ${results.autoMappings?.mapped || 0}`);

    return res.json({
      message: "Import confirmed successfully",
      results,
    });
  } catch (error) {
    console.error("❌ Import process failed:", error.message);
    console.error("   Full error:", error);
    return next(error);
  }
}

export function getImportPreview(req, res) {
  const queue = ensureImportSession(req);
  return res.json({
    students: queue.students.slice(0, 10),
    teachers: queue.teachers.slice(0, 10),
  });
}

export async function fetchImportActivity(req, res, next) {
  try {
    const activity = await getRecentImportActivity();
    return res.json({ activity });
  } catch (error) {
    return next(error);
  }
}

export async function fetchDashboardStats(req, res, next) {
  try {
    const [studentCount] = await pool.query(
      `SELECT COUNT(*) as count FROM student_details_db`,
    );

    console.log("📊 Student count query result:", studentCount);
    console.log("📊 Student count value:", studentCount?.[0]?.count);

    const [teacherCount] = await pool.query(
      `SELECT COUNT(DISTINCT teacher_id) as count FROM teacher_details_db`,
    );

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

    // Get distinct subjects from teacher records
    const [subjectsList] = await pool.query(
      `SELECT DISTINCT subject FROM teacher_details_db 
       WHERE subject IS NOT NULL AND subject != ''
       ORDER BY subject`,
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

    // Get stream-division combinations with student counts
    const [streamDivisionCounts] = await pool.query(
      `SELECT stream, division, COUNT(*) as students
       FROM student_details_db
       WHERE stream IS NOT NULL AND division IS NOT NULL
       GROUP BY stream, division
       ORDER BY 
         CASE 
           WHEN stream = 'BSCIT' THEN 1
           WHEN stream = 'BSCDS' THEN 2
           ELSE 3
         END, 
         division`,
    );

    const response = {
      students: studentCount?.[0]?.count || 0,
      teachers: teacherCount?.[0]?.count || 0,
      streams: streamsList.map((s) => s.stream),
      divisions: uniqueDivisions,
      subjects: subjectsList.map((s) => s.subject),
      streamDivisionCounts: streamDivisionCounts || [],
    };

    console.log(
      "📊 Sending response to frontend:",
      JSON.stringify(response, null, 2),
    );

    return res.json(response);
  } catch (error) {
    return next(error);
  }
}

export async function downloadTemplate(req, res) {
  const { type } = req.params;
  const { stream, division, year } = req.query;
  const allowed = ["students", "teachers"];

  if (!allowed.includes(type)) {
    return res.status(404).json({ message: "Template not found" });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(
      type === "students" ? "Students" : "Teachers",
    );

    if (type === "students") {
      // Define columns for students
      worksheet.columns = [
        { header: "Student_ID", key: "student_id", width: 15 },
        { header: "Name", key: "student_name", width: 30 },
        { header: "Roll_No", key: "roll_no", width: 12 },
        { header: "Year", key: "year", width: 10 },
        { header: "Stream", key: "stream", width: 15 },
        { header: "Division", key: "division", width: 12 },
      ];

      // Build query with optional filters
      let query = `SELECT student_id, student_name, roll_no, year, stream, division
                   FROM student_details_db
                   WHERE 1=1`;
      const params = [];

      if (stream && stream !== "ALL") {
        query += ` AND stream = ?`;
        params.push(stream);
      }

      if (division && division !== "ALL") {
        query += ` AND division = ?`;
        params.push(division);
      }

      if (year && year !== "ALL") {
        query += ` AND year = ?`;
        params.push(year);
      }

      query += ` ORDER BY year, 
        CASE 
          WHEN stream = 'BSCIT' THEN 1
          WHEN stream = 'BSCDS' THEN 2
          ELSE 3
        END, 
        division, 
        student_id, 
        roll_no`;

      // Fetch student data from database
      const [students] = await pool.query(query, params);

      // Add rows
      if (students && Array.isArray(students)) {
        students.forEach((student) => {
          worksheet.addRow(student);
        });
      }

      // Style header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    } else if (type === "teachers") {
      // Define columns for teachers
      worksheet.columns = [
        { header: "Teacher_ID", key: "teacher_id", width: 15 },
        { header: "Name", key: "name", width: 30 },
        { header: "Subject", key: "subject", width: 35 },
        { header: "Year", key: "year", width: 10 },
        { header: "Stream", key: "stream", width: 15 },
      ];

      // Fetch teacher data from database
      const [teachers] = await pool.query(
        `SELECT teacher_id, name, subject, year, stream
         FROM teacher_details_db
         ORDER BY year, 
           CASE 
             WHEN stream = 'BSCIT' THEN 1
             WHEN stream = 'BSCDS' THEN 2
             ELSE 3
           END, 
           name`,
      );

      // Add rows
      if (teachers && Array.isArray(teachers)) {
        teachers.forEach((teacher) => {
          worksheet.addRow(teacher);
        });
      }

      // Style header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    }

    // Set response headers for Excel download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    // Generate filename based on filters
    let filename = type;
    if (type === "students" && (stream || division || year)) {
      const parts = [];
      if (year && year !== "ALL") parts.push(year);
      if (stream && stream !== "ALL") parts.push(stream);
      if (division && division !== "ALL") parts.push(division);

      // Add "All" labels for filters
      if (year === "ALL") parts.push("All_Years");
      if (stream === "ALL") parts.push("All_Streams");
      if (division === "ALL") parts.push("All_Divisions");

      filename = parts.length > 0 ? parts.join("_") + "_students" : "students";
    }
    filename += `_${new Date().toISOString().split("T")[0]}.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating template:", error);
    return res.status(500).json({
      message: "Failed to generate export file",
      error: error.message,
    });
  }
}

export async function getAttendanceHistory(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT id, filename, session_id, teacher_id, subject, year, stream, division, started_at, saved_at
       FROM attendance_backup
       ORDER BY saved_at DESC
       LIMIT 200`,
    );

    return res.json({ history: rows });
  } catch (error) {
    return next(error);
  }
}

export async function downloadAttendanceBackup(req, res, next) {
  try {
    const backupId = req.params.id;

    const [backup] = await pool.query(
      `SELECT filename, session_id, subject, year, semester, stream, division, started_at, records, teacher_id FROM attendance_backup WHERE id = ?`,
      [backupId],
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
      [record.teacher_id],
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

export async function deleteAllData(req, res, next) {
  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Delete data from all tables except attendance backups
      await connection.query(`DELETE FROM student_details_db`);
      await connection.query(`DELETE FROM teacher_details_db`);
      await connection.query(`DELETE FROM teacher_student_map`);
      await connection.query(`DELETE FROM attendance_sessions`);
      await connection.query(`DELETE FROM attendance_records`);
      await connection.query(
        `DELETE FROM activity_logs WHERE actor_role != 'admin'`,
      );

      // Log the action
      await connection.query(
        `INSERT INTO activity_logs 
          (actor_role, actor_id, action, details, created_at) 
         VALUES ('admin', ?, 'DELETE_ALL_DATA', ?, NOW())`,
        [
          req.session.user.id,
          JSON.stringify({ timestamp: new Date().toISOString() }),
        ],
      );

      await connection.commit();

      return res.json({
        message: "All data deleted successfully",
        collectionsCleared: [
          "students",
          "teachers",
          "teacherStudentMaps",
          "attendanceSessions",
          "attendanceRecords",
        ],
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    return next(error);
  }
}

export async function clearAttendanceHistory(req, res, next) {
  try {
    const [result] = await pool.query(`DELETE FROM attendance_backup`);

    // Log the action
    await pool.query(
      `INSERT INTO activity_logs 
        (actor_role, actor_id, action, details, created_at) 
       VALUES ('admin', ?, 'CLEAR_ATTENDANCE_HISTORY', ?, NOW())`,
      [
        req.session.user.id,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          recordsDeleted: result.affectedRows,
        }),
      ],
    );

    return res.json({
      message: "Attendance history cleared successfully",
      recordsDeleted: result.affectedRows,
    });
  } catch (error) {
    return next(error);
  }
}

export async function triggerAutoMapping(req, res, next) {
  try {
    const result = await autoMapStudentsToTeachers(req.session.user.id);

    return res.json({
      message: "Students automatically mapped to teachers",
      mapped: result.mapped,
    });
  } catch (error) {
    return next(error);
  }
}

// Defaulter List Management

export async function getDefaulterList(req, res, next) {
  try {
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

    let defaulters;
    if (type === "overall") {
      defaulters = await defaulterService.getOverallDefaulters({
        stream,
        division,
        year,
        threshold: parseFloat(threshold),
      });
    } else {
      defaulters = await defaulterService.getDefaulterList({
        month: month ? parseInt(month) : undefined,
        year: year ? parseInt(year) : undefined,
        stream,
        division,
        subject,
        threshold: parseFloat(threshold),
        start_date,
        end_date,
      });
    }

    if (defaulters.length === 0) {
      return res.json({
        defaulters: [],
        count: 0,
        threshold: parseFloat(threshold),
        message:
          "No defaulters found. This could mean either no students are below the threshold, or no attendance data exists yet.",
      });
    }

    // ── Auto-save to Defaulter_History_Lists on every view (non-fatal) ──────
    try {
      const adminId = req.session?.user?.id || "admin";
      const parts = [];
      if (year) parts.push(`Year: ${year}`);
      if (stream) parts.push(`Stream: ${stream}`);
      if (division) parts.push(`Div: ${division}`);
      if (month) parts.push(`Month: ${month}`);
      parts.push(`Threshold: ${parseFloat(threshold)}%`);
      await pool.query(
        `INSERT INTO Defaulter_History_Lists
           (teacher_id, teacher_name, threshold, year, stream, division, month,
            defaulter_count, filters_summary, defaulters_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          adminId,
          "Admin",
          parseFloat(threshold),
          year || null,
          stream || null,
          division || null,
          month ? parseInt(month) : null,
          defaulters.length,
          parts.join(" | "),
          JSON.stringify(defaulters),
        ],
      );
    } catch (histErr) {
      console.warn(
        "⚠️  Admin defaulter history save skipped:",
        histErr.message,
      );
    }

    return res.json({
      defaulters,
      count: defaulters.length,
      threshold: parseFloat(threshold),
    });
  } catch (error) {
    console.error("Defaulter list error:", error);
    return res.status(500).json({
      message:
        "Failed to generate defaulter list. Please ensure attendance has been marked for students.",
      error: error.message,
    });
  }
}

export async function downloadDefaulterList(req, res, next) {
  try {
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

    let defaulters;
    if (type === "overall") {
      defaulters = await defaulterService.getOverallDefaulters({
        stream,
        division,
        year,
        threshold: parseFloat(threshold),
      });
    } else {
      defaulters = await defaulterService.getDefaulterList({
        month: month ? parseInt(month) : undefined,
        year: year ? parseInt(year) : undefined,
        stream,
        division,
        subject,
        threshold: parseFloat(threshold),
        start_date,
        end_date,
      });
    }

    if (defaulters.length === 0) {
      return res.status(404).json({
        message:
          "No defaulters found. This could mean either no students are below the threshold, or no attendance data exists yet. Please ensure attendance has been marked for students.",
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
        req.session.user.id,
        "admin",
      );
    } catch (histErr) {
      console.warn("⚠️  defaulter_history save skipped:", histErr.message);
    }

    // Notify about defaulter generation
    notificationService.notifyDefaulterGenerated({
      userId: req.session.user.id,
      userName: req.session.user.name,
      role: "admin",
      count: defaulters.length,
      threshold: parseFloat(threshold),
      filters: { month, year, stream, division, subject, type },
    });

    // Log activity
    await pool.query(
      `INSERT INTO activity_logs 
        (actor_role, actor_id, action, details, created_at) 
       VALUES ('admin', ?, 'DOWNLOAD_DEFAULTER_LIST', ?, NOW())`,
      [
        req.session.user.id,
        JSON.stringify({
          count: defaulters.length,
          threshold: parseFloat(threshold),
          filters: { month, year, stream, division, subject },
        }),
      ],
    );

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

export async function updateMonthlyAttendance(req, res, next) {
  try {
    await defaulterService.updateMonthlyAttendance();

    await pool.query(
      `INSERT INTO activity_logs 
        (actor_role, actor_id, action, details, created_at) 
       VALUES ('admin', ?, 'UPDATE_MONTHLY_ATTENDANCE', ?, NOW())`,
      [
        req.session.user.id,
        JSON.stringify({ timestamp: new Date().toISOString() }),
      ],
    );

    return res.json({
      message: "Monthly attendance updated successfully",
    });
  } catch (error) {
    return next(error);
  }
}

export async function getAttendanceDates(req, res, next) {
  try {
    const { month, year } = req.query;

    if (!month || month === "ALL") {
      return res.json({ dates: [] });
    }

    const params = [];
    let query = `
      SELECT DISTINCT DATE(started_at) as attendance_date
      FROM attendance_sessions
      WHERE MONTH(started_at) = ?
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

// Teacher Information
export async function getTeachersInfo(req, res, next) {
  try {
    const query = `
      SELECT 
        t.teacher_id,
        MAX(t.name) as teacher_name,
        GROUP_CONCAT(DISTINCT t.subject ORDER BY t.subject SEPARATOR ', ') as subject,
        GROUP_CONCAT(DISTINCT t.year ORDER BY t.year SEPARATOR ', ') as year,
        GROUP_CONCAT(DISTINCT t.stream ORDER BY t.stream SEPARATOR ', ') as stream,
        GROUP_CONCAT(DISTINCT t.semester ORDER BY t.semester SEPARATOR ', ') as semester,
        GROUP_CONCAT(DISTINCT t.division ORDER BY t.division SEPARATOR ', ') as division,
        (
          SELECT COUNT(DISTINCT tsm.student_id)
          FROM teacher_student_map tsm
          WHERE tsm.teacher_id = t.teacher_id
        ) as student_count
      FROM teacher_details_db t
      GROUP BY t.teacher_id
      ORDER BY 
        CASE 
          WHEN MAX(t.stream) = 'BSCIT' THEN 1
          WHEN MAX(t.stream) = 'BSCDS' THEN 2
          ELSE 3
        END,
        t.teacher_id ASC
    `;

    const [teachers] = await pool.query(query);

    return res.json({
      teachers: teachers || [],
      count: teachers?.length || 0,
    });
  } catch (error) {
    console.error("Get teachers info error:", error);
    return res.status(500).json({
      message: "Failed to fetch teachers information",
      error: error.message,
    });
  }
}

// Student Information by Stream and Division
export async function getStudentsInfo(req, res, next) {
  try {
    const { year, stream, semester, division } = req.query;

    console.log("📋 getStudentsInfo called with:", {
      year,
      stream,
      semester,
      division,
    });

    if (!year || !stream || !semester || !division) {
      return res.status(400).json({
        message: "Year, stream, semester, and division are required",
      });
    }

    // Build dynamic WHERE clause for students
    let studentsWhere = "WHERE year = ? AND stream = ?";
    let studentsParams = [year, stream];

    if (division !== "ALL") {
      studentsWhere += " AND division = ?";
      studentsParams.push(division);
    }

    // Get students
    const studentsQuery = `
      SELECT 
        student_id,
        student_name,
        roll_no,
        year,
        stream,
        division
      FROM student_details_db
      ${studentsWhere}
      ORDER BY 
        CASE 
          WHEN stream = 'BSCIT' THEN 1
          WHEN stream = 'BSCDS' THEN 2
          ELSE 3
        END,
        student_id ASC, 
        roll_no ASC
    `;

    console.log("📝 Students Query:", studentsQuery);
    console.log("📝 Query Params:", studentsParams);

    const [students] = await pool.query(studentsQuery, studentsParams);

    console.log(`✅ Found ${students.length} students`);
    if (students.length > 0) {
      console.log(
        "   Sample:",
        students.slice(0, 3).map((s) => `${s.student_id} - ${s.student_name}`),
      );
    }

    // Build WHERE clause for subjects/teachers (teachers have semesters)
    let teacherWhere = "WHERE year = ? AND stream = ?";
    let teacherParams = [year, stream];

    if (semester !== "ALL") {
      teacherWhere += " AND semester = ?";
      teacherParams.push(semester);
    }

    if (division !== "ALL") {
      // Split comma-separated divisions for teachers
      teacherWhere += " AND (";
      const divisionConditions = [];
      divisionConditions.push("FIND_IN_SET(?, division) > 0");
      teacherParams.push(division);
      teacherWhere += divisionConditions.join(" OR ") + ")";
    }

    // Get subjects taught in this year/stream/semester/division
    const subjectsQuery = `
      SELECT DISTINCT subject
      FROM teacher_details_db
      ${teacherWhere}
      ORDER BY subject
    `;
    const [subjects] = await pool.query(subjectsQuery, teacherParams);

    // Get teachers teaching this year/stream/semester/division
    const teachersQuery = `
      SELECT DISTINCT 
        teacher_id,
        name as teacher_name,
        subject
      FROM teacher_details_db
      ${teacherWhere}
      ORDER BY name
    `;
    const [teachers] = await pool.query(teachersQuery, teacherParams);

    return res.json({
      students: students || [],
      subjects: subjects?.map((s) => s.subject) || [],
      teachers: teachers || [],
      year,
      stream,
      semester,
      division,
      count: students?.length || 0,
    });
  } catch (error) {
    console.error("Get students info error:", error);
    return next(error);
  }
}

// Get streams and divisions filtered by year and optionally stream
export async function getStreamsDivisions(req, res, next) {
  try {
    const { year, stream } = req.query;

    if (!year) {
      return res.status(400).json({
        message: "Year is required",
      });
    }

    // Get distinct streams for the year
    const [streamsList] = await pool.query(
      `SELECT DISTINCT stream FROM student_details_db 
       WHERE year = ? AND stream IS NOT NULL AND stream != ''
       ORDER BY stream`,
      [year],
    );

    // If stream is provided, get divisions for that year-stream combination
    // Otherwise, get all divisions for the year
    let divisionsQuery;
    let queryParams;

    if (stream) {
      divisionsQuery = `SELECT DISTINCT division FROM student_details_db 
                        WHERE year = ? AND stream = ? AND division IS NOT NULL AND division != ''
                        ORDER BY division`;
      queryParams = [year, stream];
    } else {
      divisionsQuery = `SELECT DISTINCT division FROM student_details_db 
                        WHERE year = ? AND division IS NOT NULL AND division != ''
                        ORDER BY division`;
      queryParams = [year];
    }

    const [divisionsList] = await pool.query(divisionsQuery, queryParams);

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
    console.error("Get streams/divisions error:", error);
    return next(error);
  }
}

// Get divisions from teacher_details_db based on stream, year, and semester
export async function getTeacherDivisions(req, res, next) {
  try {
    const { stream, year, semester } = req.query;

    if (!stream) {
      return res.status(400).json({
        message: "Stream is required",
      });
    }

    // If year and semester are provided, filter by them
    let query = `SELECT DISTINCT division FROM teacher_details_db WHERE stream = ?`;
    let params = [stream];

    if (year) {
      query += ` AND year = ?`;
      params.push(year);
    }

    if (semester) {
      query += ` AND semester = ?`;
      params.push(semester);
    }

    query += ` AND division IS NOT NULL AND division != '' ORDER BY division`;

    const [divisionsList] = await pool.query(query, params);

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
      divisions: uniqueDivisions,
    });
  } catch (error) {
    console.error("Get teacher divisions error:", error);
    return next(error);
  }
}

// Get divisions from student_details_db based on stream and year
export async function getStudentDivisions(req, res, next) {
  try {
    const { stream, year } = req.query;

    if (!stream || !year) {
      return res.status(400).json({
        message: "Stream and year are required",
      });
    }

    const [divisionsList] = await pool.query(
      `SELECT DISTINCT division FROM student_details_db 
       WHERE stream = ? AND year = ?
       AND division IS NOT NULL AND division != ''
       ORDER BY division`,
      [stream, year],
    );

    const divisions = divisionsList.map((d) => d.division);

    return res.json({
      divisions,
    });
  } catch (error) {
    console.error("Get student divisions error:", error);
    return next(error);
  }
}

// Get streams from teacher_details_db
export async function getTeacherStreams(req, res, next) {
  try {
    const [streamsList] = await pool.query(
      `SELECT DISTINCT stream FROM teacher_details_db 
       WHERE stream IS NOT NULL AND stream != ''
       ORDER BY stream`,
    );

    return res.json({
      streams: streamsList.map((s) => s.stream),
    });
  } catch (error) {
    console.error("Get teacher streams error:", error);
    return next(error);
  }
}

// Get streams from student_details_db
export async function getStudentStreams(req, res, next) {
  try {
    const [streamsList] = await pool.query(
      `SELECT DISTINCT stream FROM student_details_db 
       WHERE stream IS NOT NULL AND stream != ''
       ORDER BY stream`,
    );

    return res.json({
      streams: streamsList.map((s) => s.stream),
    });
  } catch (error) {
    console.error("Get student streams error:", error);
    return next(error);
  }
}

// Get session students for view in admin
export async function getSessionStudents(req, res, next) {
  try {
    const sessionId = req.params.id;

    const [backup] = await pool.query(
      `SELECT filename, session_id, subject, year, semester, stream, division, started_at, records, teacher_id FROM attendance_backup WHERE id = ?`,
      [sessionId],
    );

    if (!backup || !Array.isArray(backup) || backup.length === 0) {
      return res.status(404).json({ message: "Session not found" });
    }

    const record = backup[0];

    // Parse the records JSON to get student details
    let students = [];
    try {
      students = JSON.parse(record.records || "[]");
    } catch (err) {
      console.error("Failed to parse records:", err);
      return res.status(500).json({ message: "Invalid session data" });
    }

    return res.json({
      session: {
        id: sessionId,
        filename: record.filename,
        session_id: record.session_id,
        subject: record.subject,
        year: record.year,
        semester: record.semester,
        stream: record.stream,
        division: record.division,
        started_at: record.started_at,
        teacher_id: record.teacher_id,
      },
      students,
    });
  } catch (error) {
    console.error("Get session students error:", error);
    return next(error);
  }
}

// Delete attendance session
export async function deleteAttendanceSession(req, res, next) {
  try {
    const sessionId = req.params.id;

    const [result] = await pool.query(
      `DELETE FROM attendance_backup WHERE id = ?`,
      [sessionId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Session not found" });
    }

    // Log the action
    await pool.query(
      `INSERT INTO activity_logs 
        (actor_role, actor_id, action, details, created_at) 
       VALUES ('admin', ?, 'DELETE_ATTENDANCE_SESSION', ?, NOW())`,
      [
        req.session.user.id,
        JSON.stringify({
          sessionId,
          timestamp: new Date().toISOString(),
        }),
      ],
    );

    return res.json({
      message: "Attendance session deleted successfully",
    });
  } catch (error) {
    console.error("Delete attendance session error:", error);
    return next(error);
  }
}

// Get all students for clickable Total Students card
export async function getAllStudents(req, res, next) {
  try {
    const [students] = await pool.query(
      `SELECT student_id, student_name, year, stream, division
       FROM student_details_db
       ORDER BY year, 
         CASE 
           WHEN stream = 'BSCIT' THEN 1
           WHEN stream = 'BSCDS' THEN 2
           ELSE 3
         END, 
         division, 
         student_id, 
         student_name`,
    );

    return res.json({
      allStudents: students || [],
      count: students?.length || 0,
    });
  } catch (error) {
    console.error("Get all students error:", error);
    return next(error);
  }
}

// Get all teachers for clickable Total Teachers card
export async function getAllTeachers(req, res, next) {
  try {
    // Group by teacher_id and merge all assignments into comma-separated lists
    const query = `
      SELECT 
        teacher_id,
        MAX(name) AS teacher_name,
        GROUP_CONCAT(DISTINCT subject ORDER BY subject SEPARATOR ', ') as subject,
        GROUP_CONCAT(DISTINCT year ORDER BY year SEPARATOR ', ') as year,
        GROUP_CONCAT(DISTINCT stream ORDER BY 
          CASE 
            WHEN stream = 'BSCIT' THEN 1
            WHEN stream = 'BSCDS' THEN 2
            ELSE 3
          END SEPARATOR ', ') as stream,
        GROUP_CONCAT(DISTINCT semester ORDER BY semester SEPARATOR ', ') as semester,
        GROUP_CONCAT(DISTINCT division ORDER BY division SEPARATOR ', ') as division
      FROM teacher_details_db
      GROUP BY teacher_id
      ORDER BY teacher_id ASC
    `;

    const [teachers] = await pool.query(query);

    return res.json({
      allTeachers: teachers || [],
      count: teachers?.length || 0,
    });
  } catch (error) {
    console.error("Get all teachers error:", error);
    return next(error);
  }
}

// Get all subjects for clickable Subjects card
export async function getAllSubjects(req, res, next) {
  try {
    const query = `
      SELECT 
        subject,
        year,
        stream,
        division,
        name as teacher_name
      FROM teacher_details_db
      ORDER BY subject, year, 
        CASE 
          WHEN stream = 'BSCIT' THEN 1
          WHEN stream = 'BSCDS' THEN 2
          ELSE 3
        END, 
        division
    `;

    const [subjects] = await pool.query(query);

    return res.json({
      allSubjects: subjects || [],
      count: subjects?.length || 0,
    });
  } catch (error) {
    console.error("Get all subjects error:", error);
    return next(error);
  }
}

// Get all divisions for clickable Divisions card
export async function getAllDivisions(req, res, next) {
  try {
    const query = `
      SELECT 
        division,
        GROUP_CONCAT(DISTINCT name ORDER BY name SEPARATOR ', ') as teachers
      FROM teacher_details_db
      WHERE division IS NOT NULL AND division != ''
      GROUP BY division
      ORDER BY division
    `;

    const [divisions] = await pool.query(query);

    // Split comma-separated divisions and aggregate teachers
    const divisionMap = new Map();

    divisions.forEach((item) => {
      const divs = item.division.split(",").map((d) => d.trim().toUpperCase());
      divs.forEach((div) => {
        if (!divisionMap.has(div)) {
          divisionMap.set(div, new Set());
        }
        const teacherNames = item.teachers.split(",").map((t) => t.trim());
        teacherNames.forEach((teacher) => divisionMap.get(div).add(teacher));
      });
    });

    const result = Array.from(divisionMap.entries())
      .map(([division, teachersSet]) => ({
        division,
        teachers: Array.from(teachersSet).join(", "),
      }))
      .sort((a, b) => a.division.localeCompare(b.division));

    return res.json({
      allDivisions: result,
      count: result.length,
    });
  } catch (error) {
    console.error("Get all divisions error:", error);
    return next(error);
  }
}

// Get students by filters (stream, division, year) for export preview
export async function getStudentsByFilters(req, res, next) {
  try {
    const { stream, division, year } = req.query;

    let query = `
      SELECT 
        student_id,
        student_name as name,
        roll_no,
        year,
        stream,
        division
      FROM student_details_db
      WHERE 1=1
    `;
    const params = [];

    if (stream && stream !== "ALL") {
      query += ` AND stream = ?`;
      params.push(stream);
    }

    if (division && division !== "ALL") {
      query += ` AND division = ?`;
      params.push(division);
    }

    if (year && year !== "ALL") {
      query += ` AND year = ?`;
      params.push(year);
    }

    query += ` ORDER BY year, 
      CASE 
        WHEN stream = 'BSCIT' THEN 1
        WHEN stream = 'BSCDS' THEN 2
        ELSE 3
      END, 
      division, 
      student_id, 
      roll_no`;

    const [students] = await pool.query(query, params);

    return res.json({
      students: students || [],
      count: students?.length || 0,
    });
  } catch (error) {
    console.error("Get students by filters error:", error);
    return next(error);
  }
}

// ── Admin: Defaulter History CRUD ─────────────────────────────────────────

export async function getAdminDefaulterHistory(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT id, teacher_id, teacher_name, threshold, year, stream, division, month,
              defaulter_count, filters_summary, created_at
       FROM Defaulter_History_Lists
       ORDER BY created_at DESC
       LIMIT 200`,
    );
    return res.json({ history: rows || [] });
  } catch (error) {
    console.error("Admin get defaulter history error:", error);
    return next(error);
  }
}

export async function viewAdminDefaulterHistoryEntry(req, res, next) {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT * FROM Defaulter_History_Lists WHERE id = ?`,
      [id],
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "Record not found" });
    }
    const record = rows[0];
    let defaulters = [];
    try {
      defaulters = record.defaulters_json
        ? JSON.parse(record.defaulters_json)
        : [];
    } catch (_) { }
    return res.json({ record, defaulters });
  } catch (error) {
    console.error("Admin view defaulter history entry error:", error);
    return next(error);
  }
}

export async function deleteAdminDefaulterHistoryEntry(req, res, next) {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      `DELETE FROM Defaulter_History_Lists WHERE id = ?`,
      [id],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Record not found" });
    }
    return res.json({ message: "Record deleted successfully" });
  } catch (error) {
    console.error("Admin delete defaulter history entry error:", error);
    return next(error);
  }
}

export async function downloadAdminDefaulterHistoryEntry(req, res, next) {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT * FROM Defaulter_History_Lists WHERE id = ?`,
      [id],
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "Record not found" });
    }
    const record = rows[0];
    let defaulters = [];
    try {
      defaulters = record.defaulters_json
        ? JSON.parse(record.defaulters_json)
        : [];
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
    console.error("Admin download defaulter history entry error:", error);
    return next(error);
  }
}

// Search for student by ID
export async function searchStudent(req, res, next) {
  try {
    const { studentId } = req.params;

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
      LEFT JOIN attendance_records ar ON s.student_id = ar.student_id
      LEFT JOIN attendance_sessions ases ON ar.session_id = ases.session_id
      WHERE s.division = ?
      GROUP BY s.student_id
      ORDER BY 
        CASE WHEN s.stream = 'BSCIT' THEN 1 WHEN s.stream = 'BSCDS' THEN 2 ELSE 3 END,
        s.student_id ASC`;
      params = [trimmedInput.toUpperCase()];
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
      LEFT JOIN attendance_records ar ON s.student_id = ar.student_id
      LEFT JOIN attendance_sessions ases ON ar.session_id = ases.session_id
      WHERE s.roll_no = ?
      GROUP BY s.student_id
      ORDER BY 
        CASE WHEN s.stream = 'BSCIT' THEN 1 WHEN s.stream = 'BSCDS' THEN 2 ELSE 3 END,
        s.student_id ASC`;
      params = [trimmedInput];
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
      LEFT JOIN attendance_records ar ON s.student_id = ar.student_id
      LEFT JOIN attendance_sessions ases ON ar.session_id = ases.session_id
      WHERE s.student_id LIKE ? 
        OR s.student_name LIKE ?
        OR s.roll_no LIKE ?
        OR s.year LIKE ?
        OR s.stream LIKE ?
        OR s.division LIKE ?
      GROUP BY s.student_id
      ORDER BY 
        CASE WHEN s.stream = 'BSCIT' THEN 1 WHEN s.stream = 'BSCDS' THEN 2 ELSE 3 END,
        s.student_id ASC`;
      params = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm];
    }

    const [students] = await pool.query(query, params);

    if (!students || students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No student found matching your search'
      });
    }

    // If multiple results, return array; if single result, return single object
    return res.json({
      success: true,
      data: students.length === 1 ? students[0] : students,
      count: students.length
    });
  } catch (error) {
    console.error('Search student error:', error);
    return next(error);
  }
}

// Get student session attendance details
export async function getStudentSessionAttendance(req, res, next) {
  try {
    const { studentId } = req.params;

    console.log(`[Admin Sessions] Requesting sessions for student ${studentId}`);

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: 'Student ID is required'
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

    console.log(`[Admin Sessions] Found ${sessions.length} session records for student ${studentId}`);

    return res.json({
      success: true,
      data: sessions
    });
  } catch (error) {
    console.error('[Admin Sessions] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching session attendance data',
      error: error.message
    });
  }
}

// Change admin password
export async function changeAdminPassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    // Validate password length
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    // Get stored password from database or environment
    const ADMIN_USER = process.env.ADMIN_USER || "admin@markin";
    const ADMIN_PASS = process.env.ADMIN_PASSWORD || "admin123";

    // Check if there's a stored password in database
    const [storedPassword] = await pool.query(
      `SELECT password FROM admin_credentials WHERE username = ? LIMIT 1`,
      [ADMIN_USER]
    );

    const actualPassword = storedPassword.length > 0 ? storedPassword[0].password : ADMIN_PASS;

    // Verify current password
    if (currentPassword !== actualPassword) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password in database
    if (storedPassword.length > 0) {
      // Update existing record
      await pool.query(
        `UPDATE admin_credentials SET password = ?, updated_at = NOW() WHERE username = ?`,
        [newPassword, ADMIN_USER]
      );
    } else {
      // Insert new record
      await pool.query(
        `INSERT INTO admin_credentials (username, password, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`,
        [ADMIN_USER, newPassword]
      );
    }

    return res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change admin password error:', error);

    // If table doesn't exist, create it
    if (error.code === 'ER_NO_SUCH_TABLE') {
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS admin_credentials (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )
        `);

        // Retry the password change
        return changeAdminPassword(req, res, next);
      } catch (createError) {
        console.error('Error creating admin_credentials table:', createError);
        return next(createError);
      }
    }

    return next(error);
  }
}
// ===================================================================
// TEACHER MANAGEMENT FUNCTIONS
// ===================================================================

/**
 * Search for teachers based on any field
 * GET /api/admin/teachers/search/:query
 */
export async function searchTeacher(req, res, next) {
  try {
    const { query } = req.params;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const searchTerm = `%${query}%`;

    // Search across all teacher fields
    const [teachers] = await pool.query(`
      SELECT 
        t.teacher_id,
        t.name,
        t.subject,
        t.year,
        t.stream,
        t.semester,
        t.division,
        t.status,
        COUNT(DISTINCT tsm.student_id) as student_count
      FROM teacher_details_db t
      LEFT JOIN teacher_student_map tsm ON t.teacher_id = tsm.teacher_id
      WHERE t.teacher_id LIKE ?
        OR t.name LIKE ?
        OR t.subject LIKE ?
        OR t.year LIKE ?
        OR t.stream LIKE ?
        OR t.semester LIKE ?
        OR t.division LIKE ?
      GROUP BY t.teacher_id, t.subject, t.year, t.stream, t.semester, t.division
      ORDER BY t.name ASC, t.subject ASC
    `, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]);

    return res.json({
      success: true,
      teachers,
      count: teachers.length
    });

  } catch (error) {
    console.error('Error searching teachers:', error);
    return next(error);
  }
}

/**
 * Add a new teacher with validation
 * POST /api/admin/teachers/add
 */
export async function addTeacher(req, res, next) {
  try {
    const { teacherId, name, subject, year, stream, semester, division, status } = req.body;

    // Validate required fields
    if (!teacherId || !name || !subject || !year || !stream) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: teacherId, name, subject, year, stream'
      });
    }

    // Validate format
    const teacherIdRegex = /^[A-Z0-9]+$/;
    if (!teacherIdRegex.test(teacherId)) {
      return res.status(400).json({
        success: false,
        message: 'Teacher ID must contain only uppercase letters and numbers (e.g., TCH001)'
      });
    }

    // Validate year format (can be comma-separated now)
    const validYears = ['FY', 'SY', 'TY'];
    const yearArray = year.split(',').map(y => y.trim().toUpperCase());
    const invalidYears = yearArray.filter(y => !validYears.includes(y));
    if (invalidYears.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Year must be FY, SY, or TY (comma-separated for multiple)'
      });
    }

    // Validate stream format (can be comma-separated now)
    const validStreams = ['BSCIT', 'BSCDS', 'BSC'];
    const streamArray = stream.split(',').map(s => s.trim().toUpperCase());
    const invalidStreams = streamArray.filter(s => !validStreams.includes(s));
    if (invalidStreams.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Stream must be BSCIT, BSCDS, or BSC (comma-separated for multiple)'
      });
    }

    // Validate division format (comma-separated letters)
    if (division && !/^[A-Z](,[A-Z])*$/.test(division)) {
      return res.status(400).json({
        success: false,
        message: 'Division must be comma-separated uppercase letters (e.g., A,B,C)'
      });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Check if teacher already exists (just by teacher_id for clubbed records)
      const [existing] = await connection.query(
        `SELECT * FROM teacher_details_db WHERE teacher_id = ?`,
        [teacherId]
      );

      if (existing.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: `Teacher ${teacherId} already exists. Click "Edit Teacher" to modify their details instead.`
        });
      }

      // Insert new teacher with clubbed (comma-separated) values
      await connection.query(
        `INSERT INTO teacher_details_db 
         (teacher_id, name, subject, year, stream, semester, division, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          teacherId.toUpperCase(),
          name.trim(),
          subject.trim(),
          yearArray.join(', '),
          streamArray.join(', '),
          semester || '',
          division || '',
          status || 'Active'
        ]
      );

      // Backup to teacher_status_backup
      await connection.query(
        `INSERT INTO teacher_status_backup 
         (teacher_id, name, subject, year, stream, semester, division, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          teacherId.toUpperCase(),
          name.trim(),
          subject.trim(),
          yearArray.join(', '),
          streamArray.join(', '),
          semester || '',
          division || '',
          status || 'Active'
        ]
      );

      // Log activity
      await connection.query(
        `INSERT INTO activity_logs (actor_role, actor_id, action, details, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [
          'admin',
          req.session.user?.id || 'system',
          'ADD_TEACHER',
          JSON.stringify({ teacherId, name, subject, year: yearArray.join(', '), stream: streamArray.join(', ') })
        ]
      );

      await connection.commit();

      // Auto-map students to this teacher based on stream-division-year
      let mappingResult = null;
      try {
        console.log(`🔗 Auto-mapping students to teacher ${teacherId}...`);
        mappingResult = await autoMapStudentsToTeachers(req.session.user?.id || 'system');
        console.log(`✅ Mapped ${mappingResult.mapped} student-teacher relationships`);
      } catch (mappingError) {
        console.error("⚠️ Auto-mapping error (teacher added but mapping failed):", mappingError.message);
        // Continue even if auto-mapping fails - teacher was added successfully
      }

      return res.json({
        success: true,
        message: `Teacher added successfully with ${yearArray.length} year(s), ${streamArray.length} stream(s)${mappingResult ? `. Mapped ${mappingResult.mapped} students` : ''}`,
        teacher: {
          teacherId: teacherId.toUpperCase(),
          name: name.trim(),
          subject: subject.trim(),
          year: yearArray.join(', '),
          stream: streamArray.join(', '),
          semester: semester || '',
          division: division || '',
          status: status || 'Active'
        },
        mappings: mappingResult
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error adding teacher:', error);
    return next(error);
  }
}

/**
 * Remove a teacher (soft delete) and set status to Inactive
 * DELETE /api/admin/teachers/remove
 */
export async function removeTeacher(req, res, next) {
  try {
    const { teacherId, subject, year, stream, semester } = req.body;

    if (!teacherId) {
      return res.status(400).json({
        success: false,
        message: 'Teacher ID is required'
      });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Build WHERE clause based on provided parameters
      let whereConditions = ['teacher_id = ?'];
      let params = [teacherId];

      if (subject) {
        whereConditions.push('subject = ?');
        params.push(subject);
      }
      if (year) {
        whereConditions.push('year = ?');
        params.push(year);
      }
      if (stream) {
        whereConditions.push('stream = ?');
        params.push(stream);
      }
      if (semester) {
        whereConditions.push('semester = ?');
        params.push(semester);
      }

      const whereClause = whereConditions.join(' AND ');

      // Get teachers to be removed
      const [teachers] = await connection.query(
        `SELECT * FROM teacher_details_db WHERE ${whereClause}`,
        params
      );

      if (teachers.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'No matching teachers found'
        });
      }

      // Set status to Inactive instead of deleting
      await connection.query(
        `UPDATE teacher_details_db SET status = 'Inactive' WHERE ${whereClause}`,
        params
      );

      // Backup removed teachers
      for (const teacher of teachers) {
        await connection.query(
          `UPDATE teacher_status_backup 
           SET status = 'Inactive', removed_at = NOW(), removed_by = ?
           WHERE teacher_id = ? AND subject = ? AND year = ? AND stream = ?`,
          [
            req.session.user?.id || 'system',
            teacher.teacher_id,
            teacher.subject,
            teacher.year,
            teacher.stream
          ]
        );
      }

      // Log activity
      await connection.query(
        `INSERT INTO activity_logs (actor_role, actor_id, action, details, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [
          'admin',
          req.session.user?.id || 'system',
          'REMOVE_TEACHER',
          JSON.stringify({ teacherId, count: teachers.length })
        ]
      );

      await connection.commit();

      // Auto-map students after teacher removal to update mappings
      let mappingResult = null;
      try {
        console.log(`🔗 Auto-mapping students after teacher removal...`);
        mappingResult = await autoMapStudentsToTeachers(req.session.user?.id || 'system');
        console.log(`✅ Mapped ${mappingResult.mapped} student-teacher relationships`);
      } catch (mappingError) {
        console.error("⚠️ Auto-mapping error (teacher removed but mapping failed):", mappingError.message);
        // Continue even if auto-mapping fails - teacher was removed successfully
      }

      return res.json({
        success: true,
        message: `${teachers.length} teacher(s) removed and set to Inactive${mappingResult ? `. Updated ${mappingResult.mapped} student mappings` : ''}`,
        removedCount: teachers.length,
        teachers: teachers.map(t => ({
          teacherId: t.teacher_id,
          name: t.name,
          subject: t.subject
        })),
        mappings: mappingResult
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error removing teacher:', error);
    return next(error);
  }
}

/**
 * Configure teacher status (Active/Inactive)
 * PUT /api/admin/teachers/status
 */
export async function configureTeacherStatus(req, res, next) {
  try {
    const { teacherId, subject, year, stream, semester, status } = req.body;

    if (!teacherId || !status) {
      return res.status(400).json({
        success: false,
        message: 'Teacher ID and status are required'
      });
    }

    if (!['Active', 'Inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either Active or Inactive'
      });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Build WHERE clause
      let whereConditions = ['teacher_id = ?'];
      let whereParams = [teacherId];

      if (subject) {
        whereConditions.push('subject = ?');
        whereParams.push(subject);
      }
      if (year) {
        whereConditions.push('year = ?');
        whereParams.push(year);
      }
      if (stream) {
        whereConditions.push('stream = ?');
        whereParams.push(stream);
      }
      if (semester) {
        whereConditions.push('semester = ?');
        whereParams.push(semester);
      }

      const whereClause = whereConditions.join(' AND ');
      const params = [status, ...whereParams];

      // Update status
      const [result] = await connection.query(
        `UPDATE teacher_details_db SET status = ? WHERE ${whereClause}`,
        params
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'No matching teachers found'
        });
      }

      // Update backup table
      const backupParams = [status, teacherId];
      let backupWhere = 'teacher_id = ?';

      if (subject) {
        backupWhere += ' AND subject = ?';
        backupParams.push(subject);
      }
      if (year) {
        backupWhere += ' AND year = ?';
        backupParams.push(year);
      }
      if (stream) {
        backupWhere += ' AND stream = ?';
        backupParams.push(stream);
      }

      await connection.query(
        `UPDATE teacher_status_backup SET status = ? WHERE ${backupWhere}`,
        backupParams
      );

      // Log activity
      await connection.query(
        `INSERT INTO activity_logs (actor_role, actor_id, action, details, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [
          'admin',
          req.session.user?.id || 'system',
          'CONFIGURE_TEACHER_STATUS',
          JSON.stringify({ teacherId, status, affectedRows: result.affectedRows })
        ]
      );

      await connection.commit();

      // Auto-map students after status change to update mappings
      let mappingResult = null;
      try {
        console.log(`🔗 Auto-mapping students after status change...`);
        mappingResult = await autoMapStudentsToTeachers(req.session.user?.id || 'system');
        console.log(`✅ Mapped ${mappingResult.mapped} student-teacher relationships`);
      } catch (mappingError) {
        console.error("⚠️ Auto-mapping error (status updated but mapping failed):", mappingError.message);
        // Continue even if auto-mapping fails - status was updated successfully
      }

      return res.json({
        success: true,
        message: `Status updated to ${status} for ${result.affectedRows} teacher(s)${mappingResult ? `. Updated ${mappingResult.mapped} student mappings` : ''}`,
        affectedRows: result.affectedRows,
        mappings: mappingResult
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error configuring teacher status:', error);
    return next(error);
  }
}

/**
 * Get all teachers with their status
 * GET /api/admin/teachers/all
 */
export async function getAllTeachersWithStatus(req, res, next) {
  try {
    const { status } = req.query;

    let query = `
      SELECT 
        t.teacher_id,
        MAX(t.name) as name,
        MAX(t.subject) as subject,
        MAX(t.year) as year,
        MAX(t.stream) as stream,
        MAX(t.semester) as semester,
        MAX(t.division) as division,
        MAX(t.status) as status,
        COUNT(DISTINCT tsm.student_id) as student_count
      FROM teacher_details_db t
      LEFT JOIN teacher_student_map tsm ON t.teacher_id = tsm.teacher_id
    `;

    const params = [];

    if (status && ['Active', 'Inactive'].includes(status)) {
      query += ' WHERE t.status = ?';
      params.push(status);
    }

    // Group by teacher_id only since we now use clubbed records (comma-separated values)
    // Using MAX() for other fields to comply with MySQL strict mode
    query += ' GROUP BY t.teacher_id ORDER BY MAX(t.name) ASC';

    const [teachers] = await pool.query(query, params);

    return res.json({
      success: true,
      teachers,
      count: teachers.length
    });

  } catch (error) {
    console.error('Error fetching teachers:', error);
    return next(error);
  }
}

/**
 * Add multiple teacher records in batch (for multi-select combinations)
 * POST /api/admin/teachers/add-batch
 */
export async function addTeacherBatch(req, res, next) {
  try {
    const { teachers } = req.body;

    if (!teachers || !Array.isArray(teachers) || teachers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Teachers array is required'
      });
    }

    // Validate each teacher record
    for (const teacher of teachers) {
      const { teacherId, name, subject, year, stream } = teacher;

      if (!teacherId || !name || !subject || !year || !stream) {
        return res.status(400).json({
          success: false,
          message: 'Each teacher must have: teacherId, name, subject, year, stream'
        });
      }

      // Validate format
      const teacherIdRegex = /^[A-Z0-9]+$/;
      if (!teacherIdRegex.test(teacherId)) {
        return res.status(400).json({
          success: false,
          message: 'Teacher ID must contain only uppercase letters and numbers (e.g., TCH001)'
        });
      }

      // Validate year format
      const validYears = ['FY', 'SY', 'TY'];
      if (!validYears.includes(year.toUpperCase())) {
        return res.status(400).json({
          success: false,
          message: 'Year must be FY, SY, or TY'
        });
      }

      // Validate stream format
      const validStreams = ['BSCIT', 'BSCDS', 'BSC'];
      if (!validStreams.includes(stream.toUpperCase())) {
        return res.status(400).json({
          success: false,
          message: 'Stream must be BSCIT, BSCDS, or BSC'
        });
      }
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Check if teacher ID exists (any record with this teacher_id)
      const teacherId = teachers[0].teacherId;
      const [existingTeacher] = await connection.query(
        `SELECT teacher_id FROM teacher_details_db WHERE teacher_id = ? LIMIT 1`,
        [teacherId]
      );

      if (existingTeacher.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: `Teacher ${teacherId} already exists. Click "Edit Teacher" to modify their details instead.`
        });
      }

      let insertedCount = 0;
      let skippedCount = 0;

      for (const teacher of teachers) {
        const { teacherId, name, subject, year, stream, semester, division, status } = teacher;

        // Check for duplicate
        const [existing] = await connection.query(
          `SELECT * FROM teacher_details_db 
           WHERE teacher_id = ? AND subject = ? AND year = ? AND stream = ? AND semester = ?`,
          [teacherId, subject, year, stream, semester || '']
        );

        if (existing.length > 0) {
          skippedCount++;
          continue;
        }

        // Insert new teacher
        await connection.query(
          `INSERT INTO teacher_details_db 
           (teacher_id, name, subject, year, stream, semester, division, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            teacherId.toUpperCase(),
            name.trim(),
            subject.trim(),
            year.toUpperCase(),
            stream.toUpperCase(),
            semester || '',
            division || '',
            status || 'Active'
          ]
        );

        // Backup to teacher_status_backup
        await connection.query(
          `INSERT INTO teacher_status_backup 
           (teacher_id, name, subject, year, stream, semester, division, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            teacherId.toUpperCase(),
            name.trim(),
            subject.trim(),
            year.toUpperCase(),
            stream.toUpperCase(),
            semester || '',
            division || '',
            status || 'Active'
          ]
        );

        insertedCount++;
      }

      // Log activity
      await connection.query(
        `INSERT INTO activity_logs (actor_role, actor_id, action, details, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [
          'admin',
          req.session.user?.id || 'system',
          'ADD_TEACHER_BATCH',
          JSON.stringify({ teacherId: teachers[0].teacherId, name: teachers[0].name, recordCount: insertedCount })
        ]
      );

      await connection.commit();

      // Auto-map students to these teachers based on stream-division-year
      let mappingResult = null;
      try {
        console.log(`🔗 Auto-mapping students to ${insertedCount} teacher record(s)...`);
        mappingResult = await autoMapStudentsToTeachers(req.session.user?.id || 'system');
        console.log(`✅ Mapped ${mappingResult.mapped} student-teacher relationships`);
      } catch (mappingError) {
        console.error("⚠️ Auto-mapping error (teachers added but mapping failed):", mappingError.message);
        // Continue even if auto-mapping fails - teachers were added successfully
      }

      return res.json({
        success: true,
        message: `Successfully added ${insertedCount} teacher record(s)${skippedCount > 0 ? `, skipped ${skippedCount} duplicate(s)` : ''}${mappingResult ? `. Mapped ${mappingResult.mapped} students` : ''}`,
        insertedCount,
        skippedCount,
        mappings: mappingResult
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error adding teachers in batch:', error);
    return next(error);
  }
}

/**
 * Get teacher records by ID
 * GET /api/admin/teachers/get/:teacherId
 */
export async function getTeacherById(req, res, next) {
  try {
    const { teacherId } = req.params;

    if (!teacherId) {
      return res.status(400).json({
        success: false,
        message: 'Teacher ID is required'
      });
    }

    const [records] = await pool.query(
      `SELECT * FROM teacher_details_db WHERE teacher_id = ? ORDER BY subject, year, stream, semester`,
      [teacherId.toUpperCase()]
    );

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    return res.json({
      success: true,
      records,
      count: records.length
    });

  } catch (error) {
    console.error('Error fetching teacher by ID:', error);
    return next(error);
  }
}

/**
 * Edit/Update a teacher record
 * PUT /api/admin/teachers/edit
 */
export async function editTeacher(req, res, next) {
  try {
    const { teacherId, name, subject, year, stream, semester, division } = req.body;

    // Validate required fields
    if (!teacherId || !name || !subject || !year || !stream) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: teacherId, name, subject, year, stream'
      });
    }

    // Validate formats
    const validYears = ['FY', 'SY', 'TY'];
    if (!validYears.includes(year.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: 'Year must be FY, SY, or TY'
      });
    }

    const validStreams = ['BSCIT', 'BSCDS', 'BSC'];
    if (!validStreams.includes(stream.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: 'Stream must be BSCIT, BSCDS, or BSC'
      });
    }

    if (division && !/^[A-Z](,[A-Z])*$/.test(division)) {
      return res.status(400).json({
        success: false,
        message: 'Division must be comma-separated uppercase letters (e.g., A,B,C)'
      });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Update the first matching record for this teacher (by teacher_id only)
      const [result] = await connection.query(
        `UPDATE teacher_details_db 
         SET name = ?, subject = ?, year = ?, stream = ?, semester = ?, division = ?
         WHERE teacher_id = ?
         LIMIT 1`,
        [
          name.trim(),
          subject.trim(),
          year.toUpperCase(),
          stream.toUpperCase(),
          semester || '',
          division || '',
          teacherId.toUpperCase()
        ]
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Teacher not found'
        });
      }

      // Update backup table
      await connection.query(
        `UPDATE teacher_status_backup 
         SET name = ?, subject = ?, year = ?, stream = ?, semester = ?, division = ?
         WHERE teacher_id = ?
         LIMIT 1`,
        [
          name.trim(),
          subject.trim(),
          year.toUpperCase(),
          stream.toUpperCase(),
          semester || '',
          division || '',
          teacherId.toUpperCase()
        ]
      );

      // Log activity
      await connection.query(
        `INSERT INTO activity_logs (actor_role, actor_id, action, details, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [
          'admin',
          req.session.user?.id || 'system',
          'EDIT_TEACHER',
          JSON.stringify({ teacherId, name, subject })
        ]
      );

      await connection.commit();

      // Auto-map students based on updated teacher assignments
      let mappingResult = null;
      try {
        console.log(`🔗 Auto-mapping students after teacher edit...`);
        mappingResult = await autoMapStudentsToTeachers(req.session.user?.id || 'system');
        console.log(`✅ Mapped ${mappingResult.mapped} student-teacher relationships`);
      } catch (mappingError) {
        console.error("⚠️ Auto-mapping error (teacher updated but mapping failed):", mappingError.message);
        // Continue even if auto-mapping fails - teacher was updated successfully
      }

      return res.json({
        success: true,
        message: `Teacher updated successfully${mappingResult ? `. Remapped ${mappingResult.mapped} students` : ''}`,
        mappings: mappingResult
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error updating teacher:', error);
    return next(error);
  }
}

/**
 * Consolidate duplicate teacher records into clubbed records
 * POST /api/admin/teachers/consolidate
 */
export async function consolidateTeacherRecords(req, res, next) {
  const connection = await pool.getConnection();

  try {
    console.log('🔍 Starting teacher record consolidation...');

    await connection.beginTransaction();

    // Get all teachers grouped by teacher_id
    const [teachers] = await connection.query(`
      SELECT teacher_id
      FROM teacher_details_db
      GROUP BY teacher_id
      HAVING COUNT(*) > 1
    `);

    if (teachers.length === 0) {
      await connection.commit();
      return res.json({
        success: true,
        message: 'No duplicate records found. All teachers already have single clubbed records.',
        consolidatedCount: 0
      });
    }

    let consolidatedCount = 0;
    const details = [];

    for (const teacher of teachers) {
      const teacherId = teacher.teacher_id;

      // Get all records for this teacher
      const [records] = await connection.query(`
        SELECT * FROM teacher_details_db
        WHERE teacher_id = ?
        ORDER BY subject, year, stream, semester
      `, [teacherId]);

      if (records.length <= 1) continue;

      // Extract unique values for each field
      const subjects = [...new Set(records.map(r => r.subject).filter(Boolean))];
      const years = [...new Set(records.map(r => r.year).filter(Boolean))];
      const streams = [...new Set(records.map(r => r.stream).filter(Boolean))];
      const semesters = [...new Set(records.map(r => r.semester).filter(Boolean))];

      // Use first record as base
      const baseRecord = records[0];

      // Create clubbed record
      const clubbedRecord = {
        teacher_id: baseRecord.teacher_id,
        name: baseRecord.name,
        subject: subjects.join(', '),
        year: years.join(', '),
        stream: streams.join(', '),
        semester: semesters.join(', '),
        division: baseRecord.division,
        status: baseRecord.status || 'Active'
      };

      // Delete all existing records for this teacher
      await connection.query(`
        DELETE FROM teacher_details_db WHERE teacher_id = ?
      `, [teacherId]);

      // Insert the new clubbed record
      await connection.query(`
        INSERT INTO teacher_details_db 
        (teacher_id, name, subject, year, stream, semester, division, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        clubbedRecord.teacher_id,
        clubbedRecord.name,
        clubbedRecord.subject,
        clubbedRecord.year,
        clubbedRecord.stream,
        clubbedRecord.semester,
        clubbedRecord.division,
        clubbedRecord.status
      ]);

      // Also update backup table
      await connection.query(`
        DELETE FROM teacher_status_backup WHERE teacher_id = ?
      `, [teacherId]);

      await connection.query(`
        INSERT INTO teacher_status_backup 
        (teacher_id, name, subject, year, stream, semester, division, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        clubbedRecord.teacher_id,
        clubbedRecord.name,
        clubbedRecord.subject,
        clubbedRecord.year,
        clubbedRecord.stream,
        clubbedRecord.semester,
        clubbedRecord.division,
        clubbedRecord.status
      ]);

      consolidatedCount++;
      details.push({
        teacherId: clubbedRecord.teacher_id,
        name: clubbedRecord.name,
        oldRecordCount: records.length,
        newSubject: clubbedRecord.subject,
        newYear: clubbedRecord.year,
        newStream: clubbedRecord.stream
      });
    }

    await connection.commit();

    // Auto-map students based on consolidated teacher records
    let mappingResult = null;
    try {
      console.log(`🔗 Auto-mapping students after consolidation...`);
      mappingResult = await autoMapStudentsToTeachers(req.session.user?.id || 'system');
      console.log(`✅ Mapped ${mappingResult.mapped} student-teacher relationships`);
    } catch (mappingError) {
      console.error("⚠️ Auto-mapping error (consolidation complete but mapping failed):", mappingError.message);
      // Continue even if auto-mapping fails - consolidation was successful
    }

    return res.json({
      success: true,
      message: `Successfully consolidated ${consolidatedCount} teacher(s) into clubbed records${mappingResult ? `. Mapped ${mappingResult.mapped} students` : ''}`,
      consolidatedCount,
      details,
      mappings: mappingResult
    });

  } catch (error) {
    await connection.rollback();
    console.error('❌ Error consolidating records:', error);
    return next(error);
  } finally {
    connection.release();
  }
}
