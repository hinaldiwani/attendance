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
    console.log("⚠️  No students to import");
    return { inserted: 0 };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    console.log("   Transaction started for students import");

    let insertedCount = 0;
    const BATCH_SIZE = 100; // Process 100 students at a time

    // Process students in batches to avoid parameter limits
    for (let i = 0; i < students.length; i += BATCH_SIZE) {
      const batch = students.slice(i, i + BATCH_SIZE);

      // Build batch insert query with proper parameterization
      const values = batch.map(() => "(?, ?, ?, ?, ?, ?)").join(",");
      const params = batch.flatMap((student) => [
        student.studentId?.toString().trim() || "",
        student.studentName?.toString().trim() || "",
        student.rollNo?.toString().trim() || "",
        student.year?.toString().trim() || "",
        student.stream?.toString().trim() || "",
        student.division?.toString().trim() || "",
      ]);

      const sql = `
        INSERT INTO student_details_db 
          (student_id, student_name, roll_no, year, stream, division) 
        VALUES ${values}
        ON DUPLICATE KEY UPDATE 
          student_name = VALUES(student_name),
          roll_no = VALUES(roll_no),
          year = VALUES(year),
          stream = VALUES(stream),
          division = VALUES(division)
      `;

      try {
        await connection.query(sql, params);
        insertedCount += batch.length;
        console.log(
          `   ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${insertedCount}/${students.length} students`,
        );
      } catch (batchError) {
        console.error(`   ❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, batchError.message);
        throw batchError;
      }
    }

    await logActivity(connection, "admin", actorId, "IMPORT_STUDENTS", {
      total: students.length,
      inserted: insertedCount,
    });

    await connection.commit();
    console.log("   ✓ Transaction committed for students");
    return { inserted: insertedCount };
  } catch (error) {
    console.error("   ❌ Rolling back students transaction due to error:", error.message);
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function upsertTeachers(teachers, actorId) {
  if (!Array.isArray(teachers) || teachers.length === 0) {
    console.log("⚠️  No teachers to import");
    return { inserted: 0 };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    console.log("   Transaction started for teachers import");

    let insertedCount = 0;
    const BATCH_SIZE = 100; // Process 100 teachers at a time

    // Process teachers in batches to avoid parameter limits
    for (let i = 0; i < teachers.length; i += BATCH_SIZE) {
      const batch = teachers.slice(i, i + BATCH_SIZE);

      const values = batch.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(",");
      const params = batch.flatMap((teacher) => [
        teacher.teacherId?.toString().trim() || "",
        teacher.name?.toString().trim() || "",
        teacher.subject?.toString().trim() || "",
        teacher.year?.toString().trim() || "",
        teacher.stream?.toString().trim() || "",
        teacher.semester?.toString().trim() || "",
        teacher.division?.toString().trim() || "",
      ]);

      // Uses composite unique key (teacher_id, subject, year, stream, semester, division)
      // so each unique teaching assignment gets its own row
      const sql = `
        INSERT INTO teacher_details_db 
          (teacher_id, name, subject, year, stream, semester, division) 
        VALUES ${values}
        ON DUPLICATE KEY UPDATE 
          name = VALUES(name)
      `;

      try {
        await connection.query(sql, params);
        insertedCount += batch.length;
        console.log(
          `   ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${insertedCount}/${teachers.length} teachers`,
        );
      } catch (batchError) {
        console.error(`   ❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, batchError.message);
        throw batchError;
      }
    }

    await logActivity(connection, "admin", actorId, "IMPORT_TEACHERS", {
      total: teachers.length,
      inserted: insertedCount,
    });

    await connection.commit();
    console.log("   ✓ Transaction committed for teachers");
    return { inserted: insertedCount };
  } catch (error) {
    console.error("   ❌ Rolling back teachers transaction due to error:", error.message);
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
    // Teachers can have comma-separated values (e.g. "FY, SY" or "BSCIT, BSCDS")
    // Students have single values, so we use FIND_IN_SET to match within comma-separated lists
    // Teacher division may be comma-separated (e.g. "A,B,C"), student division is a single letter
    // Only maps Active teachers to students
    const [result] = await connection.query(`
      INSERT INTO teacher_student_map (teacher_id, subject, year, stream, semester, student_id)
      SELECT DISTINCT t.teacher_id, t.subject, t.year, t.stream, t.semester, s.student_id
      FROM teacher_details_db t
      INNER JOIN student_details_db s 
        ON FIND_IN_SET(s.year, REPLACE(t.year, ' ', '')) > 0
        AND FIND_IN_SET(s.stream, REPLACE(t.stream, ' ', '')) > 0
        AND FIND_IN_SET(s.division, REPLACE(t.division, ' ', '')) > 0
      WHERE (t.status = 'Active' OR t.status IS NULL)
        AND t.division IS NOT NULL 
        AND t.division != ''
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
