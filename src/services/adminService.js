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

const TEMPLATE_TYPE_STUDENTS = "students";
const TEMPLATE_TYPE_TEACHERS = "teachers";
const IMPORT_TEMPLATE_TABLE = "bulk_import_template";
const IMPORT_TEMPLATE_BACKUP_TABLE = "bulk_import_template_backup";
const LEGACY_IMPORT_TEMPLATE_TABLE = "import_template";
const LEGACY_IMPORT_TEMPLATE_BACKUP_TABLE = "import_template_backup";

function normalizeTemplateType(type) {
  if (type === TEMPLATE_TYPE_STUDENTS || type === TEMPLATE_TYPE_TEACHERS) {
    return type;
  }
  throw new Error("Invalid template type");
}

function parseTemplateRow(rowData) {
  try {
    return JSON.parse(rowData || "{}");
  } catch (error) {
    return {};
  }
}

function serializeTemplateRow(row) {
  return JSON.stringify(row || {});
}

function buildTemplateRowKey(type, row = {}) {
  if (type === TEMPLATE_TYPE_STUDENTS) {
    return String(row.studentId || "").trim().toUpperCase();
  }

  const teacherKeyParts = [
    row.teacherId,
    row.subject,
    row.year,
    row.stream,
    row.semester,
    row.division,
  ];

  return teacherKeyParts
    .map((value) => String(value || "").trim().toUpperCase())
    .join("|");
}

function shouldKeepTemplateRow(type, row = {}) {
  if (type === TEMPLATE_TYPE_STUDENTS) {
    return Boolean(String(row.studentId || "").trim());
  }

  return Boolean(String(row.teacherId || "").trim());
}

async function removeExactTemplateDuplicates(connection) {
  const [rows] = await connection.query(
    `SELECT id, template_type, row_data
     FROM ${IMPORT_TEMPLATE_TABLE}
     ORDER BY id ASC`,
  );

  const seen = new Set();
  const duplicateIds = [];

  rows.forEach((row) => {
    const dedupeKey = `${row.template_type}::${row.row_data}`;
    if (seen.has(dedupeKey)) {
      duplicateIds.push(row.id);
      return;
    }
    seen.add(dedupeKey);
  });

  if (!duplicateIds.length) return;

  const placeholders = duplicateIds.map(() => "?").join(",");
  await connection.query(
    `DELETE FROM ${IMPORT_TEMPLATE_TABLE} WHERE id IN (${placeholders})`,
    duplicateIds,
  );
}

async function migrateLegacyBackupRows(connection) {
  const [legacyRows] = await connection.query(
    `SELECT id, template_type, replaced_rows_count, backup_payload, replaced_by, source_file, replaced_at, snapshot_id, row_data
     FROM ${IMPORT_TEMPLATE_BACKUP_TABLE}
     WHERE (snapshot_id IS NULL OR snapshot_id = '' OR row_data IS NULL)
       AND backup_payload IS NOT NULL
       AND backup_payload != ''`,
  );

  for (const legacy of legacyRows) {
    let parsed = [];
    try {
      parsed = JSON.parse(legacy.backup_payload || "[]");
      if (!Array.isArray(parsed)) parsed = [];
    } catch (error) {
      parsed = [];
    }

    const snapshotId = createSnapshotId();
    const rowsToPersist = parsed.length > 0 ? parsed : [{}];
    const totalRows = parsed.length;
    const BATCH_SIZE = 200;

    for (let i = 0; i < rowsToPersist.length; i += BATCH_SIZE) {
      const batch = rowsToPersist.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
      const params = batch.flatMap((row, index) => {
        const rowIndex = i + index + 1;
        const key = totalRows > 0
          ? buildTemplateRowKey(legacy.template_type, row)
          : "EMPTY_SNAPSHOT";

        return [
          legacy.template_type,
          legacy.replaced_rows_count || totalRows,
          "[]",
          legacy.replaced_by,
          snapshotId,
          rowIndex,
          serializeTemplateRow(row),
          key,
          legacy.source_file,
          legacy.replaced_at,
        ];
      });

      await connection.query(
        `INSERT INTO ${IMPORT_TEMPLATE_BACKUP_TABLE}
          (template_type, replaced_rows_count, backup_payload, replaced_by, snapshot_id, row_index, row_data, backup_key, source_file, replaced_at)
         VALUES ${placeholders}`,
        params,
      );
    }

    await connection.query(
      `DELETE FROM ${IMPORT_TEMPLATE_BACKUP_TABLE} WHERE id = ?`,
      [legacy.id],
    );
  }
}

export async function ensureImportTemplateTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${IMPORT_TEMPLATE_TABLE} (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      template_type VARCHAR(20) NOT NULL,
      row_data LONGTEXT NOT NULL,
      source_file VARCHAR(255) NULL,
      created_by VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_bulk_import_template_type (template_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${IMPORT_TEMPLATE_BACKUP_TABLE} (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      template_type VARCHAR(20) NOT NULL,
      replaced_rows_count INT NOT NULL DEFAULT 0,
      backup_payload LONGTEXT NOT NULL,
      replaced_by VARCHAR(100) NULL,
      snapshot_id VARCHAR(64) NULL,
      row_index INT NOT NULL DEFAULT 0,
      row_data LONGTEXT NULL,
      backup_key VARCHAR(255) NULL,
      source_file VARCHAR(255) NULL,
      replaced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_bulk_import_template_backup_type (template_type),
      INDEX idx_bulk_import_template_backup_snapshot (snapshot_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [backupColumns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [IMPORT_TEMPLATE_BACKUP_TABLE],
  );

  const existingBackupColumns = new Set(
    backupColumns.map((row) => row.COLUMN_NAME)
  );

  const backupColumnDefinitions = {
    snapshot_id: "ADD COLUMN snapshot_id VARCHAR(64) NULL AFTER replaced_by",
    row_index: "ADD COLUMN row_index INT NOT NULL DEFAULT 0 AFTER snapshot_id",
    row_data: "ADD COLUMN row_data LONGTEXT NULL AFTER row_index",
    backup_key: "ADD COLUMN backup_key VARCHAR(255) NULL AFTER row_data",
    source_file: "ADD COLUMN source_file VARCHAR(255) NULL AFTER backup_key",
  };

  for (const [column, definition] of Object.entries(backupColumnDefinitions)) {
    if (!existingBackupColumns.has(column)) {
      await pool.query(`ALTER TABLE ${IMPORT_TEMPLATE_BACKUP_TABLE} ${definition}`);
    }
  }

  // Ensure actor identifier columns support string IDs like admin emails.
  const [createdByColumnRows] = await pool.query(
    `SELECT DATA_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = 'created_by'`,
    [IMPORT_TEMPLATE_TABLE],
  );

  if (createdByColumnRows.length > 0) {
    const createdByType = String(createdByColumnRows[0].DATA_TYPE || "").toLowerCase();
    if (createdByType !== "varchar") {
      await pool.query(
        `ALTER TABLE ${IMPORT_TEMPLATE_TABLE} MODIFY COLUMN created_by VARCHAR(100) NULL`,
      );
    }
  }

  const [replacedByColumnRows] = await pool.query(
    `SELECT DATA_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = 'replaced_by'`,
    [IMPORT_TEMPLATE_BACKUP_TABLE],
  );

  if (replacedByColumnRows.length > 0) {
    const replacedByType = String(replacedByColumnRows[0].DATA_TYPE || "").toLowerCase();
    if (replacedByType !== "varchar") {
      await pool.query(
        `ALTER TABLE ${IMPORT_TEMPLATE_BACKUP_TABLE} MODIFY COLUMN replaced_by VARCHAR(100) NULL`,
      );
    }
  }

  // One-time migration from old table names if they exist and new table is empty.
  const [legacyTemplateExistsRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?`,
    [LEGACY_IMPORT_TEMPLATE_TABLE],
  );

  if (Number(legacyTemplateExistsRows?.[0]?.count || 0) > 0) {
    const [newCountRows] = await pool.query(
      `SELECT COUNT(*) AS count FROM ${IMPORT_TEMPLATE_TABLE}`,
    );

    if (Number(newCountRows?.[0]?.count || 0) === 0) {
      await pool.query(
        `INSERT INTO ${IMPORT_TEMPLATE_TABLE}
          (template_type, row_data, source_file, created_by, created_at)
         SELECT template_type, row_data, source_file, created_by, created_at
         FROM ${LEGACY_IMPORT_TEMPLATE_TABLE}`,
      );
    }
  }

  const [legacyBackupExistsRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?`,
    [LEGACY_IMPORT_TEMPLATE_BACKUP_TABLE],
  );

  if (Number(legacyBackupExistsRows?.[0]?.count || 0) > 0) {
    const [newBackupCountRows] = await pool.query(
      `SELECT COUNT(*) AS count FROM ${IMPORT_TEMPLATE_BACKUP_TABLE}`,
    );

    if (Number(newBackupCountRows?.[0]?.count || 0) === 0) {
      await pool.query(
        `INSERT INTO ${IMPORT_TEMPLATE_BACKUP_TABLE}
          (template_type, replaced_rows_count, backup_payload, replaced_by, replaced_at)
         SELECT template_type, replaced_rows_count, backup_payload, replaced_by, replaced_at
         FROM ${LEGACY_IMPORT_TEMPLATE_BACKUP_TABLE}`,
      );
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await migrateLegacyBackupRows(connection);
    await removeExactTemplateDuplicates(connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function createSnapshotId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}_${random}`;
}

async function insertTemplateBackupSnapshot(
  connection,
  templateType,
  existingRows,
  actorId,
  sourceFile,
) {
  const snapshotId = createSnapshotId();
  const totalRows = existingRows.length;

  const rowsToPersist = totalRows > 0 ? existingRows : [{}];
  const BATCH_SIZE = 200;

  for (let i = 0; i < rowsToPersist.length; i += BATCH_SIZE) {
    const batch = rowsToPersist.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
    const params = batch.flatMap((row, index) => {
      const rowIndex = i + index + 1;
      const key = totalRows > 0
        ? buildTemplateRowKey(templateType, row)
        : "EMPTY_SNAPSHOT";

      return [
        templateType,
        totalRows,
        "[]",
        actorId,
        snapshotId,
        rowIndex,
        serializeTemplateRow(row),
        key,
        sourceFile,
      ];
    });

    await connection.query(
      `INSERT INTO ${IMPORT_TEMPLATE_BACKUP_TABLE}
        (template_type, replaced_rows_count, backup_payload, replaced_by, snapshot_id, row_index, row_data, backup_key, source_file)
       VALUES ${placeholders}`,
      params,
    );
  }
}

export async function getImportTemplateRows(type) {
  const templateType = normalizeTemplateType(type);
  await ensureImportTemplateTables();

  const [rows] = await pool.query(
    `SELECT row_data
     FROM ${IMPORT_TEMPLATE_TABLE}
     WHERE template_type = ?
     ORDER BY id ASC`,
    [templateType],
  );

  return rows.map((item) => parseTemplateRow(item.row_data));
}

export async function getImportTemplateCounts() {
  await ensureImportTemplateTables();

  const [rows] = await pool.query(
    `SELECT template_type, COUNT(*) AS total
      FROM ${IMPORT_TEMPLATE_TABLE}
     GROUP BY template_type`,
  );

  const counts = {
    students: 0,
    teachers: 0,
  };

  rows.forEach((row) => {
    if (row.template_type === TEMPLATE_TYPE_STUDENTS) {
      counts.students = Number(row.total) || 0;
    }
    if (row.template_type === TEMPLATE_TYPE_TEACHERS) {
      counts.teachers = Number(row.total) || 0;
    }
  });

  return counts;
}

export async function storeImportTemplateRows({
  type,
  rows,
  mode = "append",
  actorId = null,
  sourceFile = null,
}) {
  const templateType = normalizeTemplateType(type);
  const normalizedMode = mode === "replace" ? "replace" : "append";
  const normalizedRows = Array.isArray(rows) ? rows : [];

  await ensureImportTemplateTables();

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingRowsRaw] = await connection.query(
      `SELECT row_data
       FROM ${IMPORT_TEMPLATE_TABLE}
       WHERE template_type = ?
       ORDER BY id ASC`,
      [templateType],
    );

    const existingRows = existingRowsRaw.map((item) =>
      parseTemplateRow(item.row_data)
    );

    if (normalizedMode === "append") {
      // Snapshot current template state before appending new rows.
      await insertTemplateBackupSnapshot(
        connection,
        templateType,
        existingRows,
        actorId,
        sourceFile,
      );
    }

    if (normalizedMode === "replace" && existingRows.length > 0) {
      await insertTemplateBackupSnapshot(
        connection,
        templateType,
        existingRows,
        actorId,
        sourceFile,
      );

      await connection.query(
        `DELETE FROM ${IMPORT_TEMPLATE_TABLE} WHERE template_type = ?`,
        [templateType],
      );
    }

    const existingKeys = new Set(
      existingRows
        .filter((row) => shouldKeepTemplateRow(templateType, row))
        .map((row) => buildTemplateRowKey(templateType, row)),
    );

    const rowsToInsert = [];
    normalizedRows.forEach((row) => {
      if (!shouldKeepTemplateRow(templateType, row)) return;
      const key = buildTemplateRowKey(templateType, row);
      if (!key) return;
      if (existingKeys.has(key)) return;
      existingKeys.add(key);
      rowsToInsert.push(row);
    });

    if (rowsToInsert.length > 0) {
      const placeholders = rowsToInsert.map(() => "(?, ?, ?, ?)").join(",");
      const params = rowsToInsert.flatMap((row) => [
        templateType,
        serializeTemplateRow(row),
        sourceFile,
        actorId,
      ]);

      await connection.query(
        `INSERT INTO ${IMPORT_TEMPLATE_TABLE}
          (template_type, row_data, source_file, created_by)
         VALUES ${placeholders}`,
        params,
      );
    }

    const finalRows = normalizedMode === "append"
      ? [...existingRows, ...rowsToInsert]
      : [...rowsToInsert];

    await connection.commit();

    return {
      mode: normalizedMode,
      previousCount: existingRows.length,
      addedCount: rowsToInsert.length,
      total: finalRows.length,
      rows: finalRows,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

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
