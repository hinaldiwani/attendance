import pool from "../../config/db.js";
import { parseExcel } from "../utils/excelParser.js";

const studentColumnMap = {
  year: ["year", "academic_year"],
  stream: ["stream", "course_stream"],
  division: ["division", "class_division"],
  rollNo: ["roll_no", "roll", "roll_number"],
  studentName: ["student_name", "name", "full_name"],
  studentId: ["student_id", "id", "enrollment_id"],
};

const teacherColumnMap = {
  teacherId: ["teacher_id", "id"],
  name: ["name", "teacher_name", "full_name"],
  subject: ["subject", "course"],
  year: ["year", "academic_year"],
  stream: ["stream", "course_stream"],
  semester: ["semester", "sem"],
  division: ["division", "class_division"],
};

export function parseStudentImport(filePath) {
  return parseExcel(filePath, studentColumnMap);
}

export function parseTeacherImport(filePath) {
  return parseExcel(filePath, teacherColumnMap);
}

export async function upsertStudents(students, actorId) {
  if (!Array.isArray(students) || students.length === 0) {
    return { total: 0, inserted: 0, skipped: 0 };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const normalizedStudents = students
      .map((student) => ({
        studentId: student.studentId?.toString().trim() || "",
        studentName: student.studentName?.toString().trim() || "",
        rollNo: student.rollNo?.toString().trim() || "",
        year: student.year?.toString().trim() || "",
        stream: student.stream?.toString().trim() || "",
        division: student.division?.toString().trim() || "",
      }))
      .filter((student) => student.studentId);

    // Remove duplicate student IDs inside the uploaded file (keep first occurrence).
    const uniqueStudents = [];
    const seenStudentIds = new Set();
    normalizedStudents.forEach((student) => {
      const key = student.studentId.toUpperCase();
      if (seenStudentIds.has(key)) return;
      seenStudentIds.add(key);
      uniqueStudents.push(student);
    });

    let insertedCount = 0;
    let skippedCount = normalizedStudents.length - uniqueStudents.length;
    const BATCH_SIZE = 100; // Process 100 students at a time

    // Process students in batches to avoid parameter limits
    for (let i = 0; i < uniqueStudents.length; i += BATCH_SIZE) {
      const batch = uniqueStudents.slice(i, i + BATCH_SIZE);

      // Build batch insert query with proper parameterization
      const values = batch.map(() => "(?, ?, ?, ?, ?, ?)").join(",");
      const params = batch.flatMap((student) => [
        student.studentId,
        student.studentName,
        student.rollNo,
        student.year,
        student.stream,
        student.division,
      ]);

      const sql = `
        INSERT IGNORE INTO student_details_db 
          (student_id, student_name, roll_no, year, stream, division) 
        VALUES ${values}
      `;

      const [result] = await connection.query(sql, params);
      const insertedThisBatch = result?.affectedRows || 0;
      insertedCount += insertedThisBatch;
      skippedCount += batch.length - insertedThisBatch;

      console.log(
        `✓ Processed batch ${Math.floor(i / BATCH_SIZE) + 1}: inserted ${insertedCount}, skipped ${skippedCount}`,
      );
    }

    await logActivity(connection, "admin", actorId, "IMPORT_STUDENTS", {
      total: normalizedStudents.length,
      inserted: insertedCount,
      skipped: skippedCount,
    });

    await connection.commit();
    return {
      total: normalizedStudents.length,
      inserted: insertedCount,
      skipped: skippedCount,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function upsertTeachers(teachers, actorId) {
  if (!Array.isArray(teachers) || teachers.length === 0) {
    return { total: 0, inserted: 0, skipped: 0 };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const normalizedTeachers = teachers
      .map((teacher) => ({
        teacherId: teacher.teacherId?.toString().trim() || "",
        name: teacher.name?.toString().trim() || "",
        subject: teacher.subject?.toString().trim() || "",
        year: teacher.year?.toString().trim() || "",
        stream: teacher.stream?.toString().trim() || "",
        semester: teacher.semester?.toString().trim() || "",
        division: teacher.division?.toString().trim() || "",
      }))
      .filter(
        (teacher) =>
          teacher.teacherId &&
          teacher.subject &&
          teacher.year &&
          teacher.stream &&
          teacher.semester,
      );

    // Remove duplicate teacher assignments inside uploaded file.
    const uniqueTeachers = [];
    const seenAssignments = new Set();
    normalizedTeachers.forEach((teacher) => {
      const key = [
        teacher.teacherId,
        teacher.subject,
        teacher.year,
        teacher.stream,
        teacher.semester,
        teacher.division,
      ]
        .map((value) => value.toUpperCase())
        .join("|");
      if (seenAssignments.has(key)) return;
      seenAssignments.add(key);
      uniqueTeachers.push(teacher);
    });

    let insertedCount = 0;
    let skippedCount = normalizedTeachers.length - uniqueTeachers.length;
    const BATCH_SIZE = 100; // Process 100 teachers at a time

    // Process teachers in batches to avoid parameter limits
    for (let i = 0; i < uniqueTeachers.length; i += BATCH_SIZE) {
      const batch = uniqueTeachers.slice(i, i + BATCH_SIZE);

      const values = batch.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(",");
      const params = batch.flatMap((teacher) => [
        teacher.teacherId,
        teacher.name,
        teacher.subject,
        teacher.year,
        teacher.stream,
        teacher.semester,
        teacher.division,
      ]);

      // Uses composite unique key (teacher_id, subject, year, stream, semester, division)
      // so each unique teaching assignment gets its own row
      const sql = `
        INSERT IGNORE INTO teacher_details_db 
          (teacher_id, name, subject, year, stream, semester, division) 
        VALUES ${values}
      `;

      const [result] = await connection.query(sql, params);
      const insertedThisBatch = result?.affectedRows || 0;
      insertedCount += insertedThisBatch;
      skippedCount += batch.length - insertedThisBatch;

      console.log(
        `✓ Processed batch ${Math.floor(i / BATCH_SIZE) + 1}: inserted ${insertedCount}, skipped ${skippedCount}`,
      );
    }

    await logActivity(connection, "admin", actorId, "IMPORT_TEACHERS", {
      total: normalizedTeachers.length,
      inserted: insertedCount,
      skipped: skippedCount,
    });

    await connection.commit();
    return {
      total: normalizedTeachers.length,
      inserted: insertedCount,
      skipped: skippedCount,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function upsertMappings(mappings, actorId) {
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return { inserted: 0 };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const values = mappings.map(() => "(?, ?)").join(",");
    const params = mappings.flatMap((item) => [item.teacherId, item.studentId]);

    const sql = `
      INSERT INTO teacher_student_mapping 
        (teacher_id, student_id) 
      VALUES ${values}
      ON DUPLICATE KEY UPDATE 
        teacher_id = VALUES(teacher_id)
    `;

    await connection.query(sql, params);

    await logActivity(connection, "admin", actorId, "CONFIRM_MAPPING", {
      total: mappings.length,
    });

    await connection.commit();
    return { inserted: mappings.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getRecentImportActivity(limit = 10) {
  const [rows] = await pool.query(
    `SELECT actor_role, action, created_at, details 
     FROM activity_logs 
     ORDER BY created_at DESC 
     LIMIT ?`,
    [limit],
  );
  return rows;
}

export async function autoMapStudentsToTeachers(actorId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Clear existing mappings
    await connection.query(`DELETE FROM teacher_student_map`);

    // Auto-map students to teachers based on YEAR, STREAM, and DIVISION
    // Teacher division may be comma-separated (e.g. "A,B,C"), student division is a single letter
    // Now includes subject, year, stream, semester to prevent cross-year mappings
    const [result] = await connection.query(`
      INSERT INTO teacher_student_map (teacher_id, subject, year, stream, semester, student_id)
      SELECT DISTINCT t.teacher_id, t.subject, t.year, t.stream, t.semester, s.student_id
      FROM teacher_details_db t
      INNER JOIN student_details_db s 
        ON t.year = s.year 
        AND t.stream = s.stream
        AND FIND_IN_SET(s.division, t.division) > 0
      WHERE UPPER(COALESCE(s.status, 'Active')) = 'ACTIVE'
      ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP
    `);

    const mappedCount = result.affectedRows;

    await logActivity(connection, "admin", actorId, "AUTO_MAP_STUDENTS", {
      mappedCount,
      timestamp: new Date().toISOString(),
    });

    await connection.commit();
    return { mapped: mappedCount };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function logActivity(
  connection,
  actorRole,
  actorId,
  action,
  details = {},
) {
  await connection.query(
    `INSERT INTO activity_logs 
      (actor_role, actor_id, action, details, created_at) 
     VALUES (?, ?, ?, ?, NOW())`,
    [actorRole, actorId, action, JSON.stringify(details)],
  );
}
