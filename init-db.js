import pool from "./config/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initializeDatabase() {
  try {
    console.log("🔍 Checking database tables...");

    // Check if tables exist
    const [tables] = await pool.query("SHOW TABLES");

    if (tables.length === 0) {
      console.log("📦 No tables found. Initializing database...");

      // Read and execute main SQL file
      const sqlFile = path.join(__dirname, "database_setup.sql");
      const sql = fs.readFileSync(sqlFile, "utf8");

      // Split by semicolon and execute each statement
      const statements = sql
        .split(";")
        .map((stmt) => stmt.trim())
        .filter((stmt) => stmt.length > 0);

      for (const statement of statements) {
        try {
          await pool.query(statement);
        } catch (err) {
          // Ignore duplicate errors
          if (!err.message.includes("already exists")) {
            console.error("Error executing statement:", err.message);
          }
        }
      }

      console.log("✅ Database initialized successfully!");
    } else {
      console.log(
        `✅ Database already initialized (${tables.length} tables found)`
      );
    }

    // Always run fix_missing_tables.sql to ensure all tables exist
    console.log("🔧 Checking for missing tables...");
    const fixFile = path.join(__dirname, "fix_missing_tables.sql");
    if (fs.existsSync(fixFile)) {
      const fixSql = fs.readFileSync(fixFile, "utf8");
      const fixStatements = fixSql
        .split(";")
        .map((stmt) => stmt.trim())
        .filter((stmt) => stmt.length > 0);

      for (const statement of fixStatements) {
        try {
          await pool.query(statement);
        } catch (err) {
          if (!err.message.includes("already exists")) {
            console.error("Error executing fix statement:", err.message);
          }
        }
      }
      console.log("✅ All tables verified and created if missing");
    }

    // Always run schema migrations to keep structure up-to-date
    await runSchemaMigrations();

  } catch (error) {
    console.error("❌ Database initialization error:", error.message);
    // Don't throw error - let the app start anyway
  }
}

async function runSchemaMigrations() {
  const connection = await pool.getConnection();
  try {
    // Migration 1: Allow multiple subject rows per teacher
    // Drop the UNIQUE KEY on teacher_id alone (prevents multiple subjects per teacher)
    // Replace with a composite unique key on the full assignment

    // First check if the composite key already exists (migration already done)
    const [compRows] = await connection.query(
      `SHOW INDEX FROM teacher_details_db WHERE Key_name = 'ux_teacher_assignment'`
    );
    if (compRows.length === 0) {
      const [uidxRows] = await connection.query(
        `SHOW INDEX FROM teacher_details_db WHERE Key_name = 'teacher_id'`
      );

      if (uidxRows.length > 0) {
        // Disable FK checks so we can safely drop/replace the index
        // even if other tables reference teacher_details_db(teacher_id)
        await connection.query(`SET FOREIGN_KEY_CHECKS = 0`);

        try {
          // Drop the old single-column unique index
          await connection.query(`ALTER TABLE teacher_details_db DROP INDEX \`teacher_id\``);
          console.log("🔧 Migration: Dropped UNIQUE KEY `teacher_id` from teacher_details_db");

          // Add composite unique key for multiple subject assignments per teacher
          await connection.query(`
            ALTER TABLE teacher_details_db
            ADD UNIQUE KEY \`ux_teacher_assignment\`
            (teacher_id(50), subject(100), year(10), stream(50), semester(10), division(50))
          `);
          console.log("🔧 Migration: Added composite UNIQUE KEY `ux_teacher_assignment`");

          // Re-add a non-unique index on teacher_id for FK lookups / query performance
          await connection.query(
            `ALTER TABLE teacher_details_db ADD INDEX \`idx_teacher_id_lookup\` (teacher_id)`
          );
          console.log("🔧 Migration: Added non-unique index `idx_teacher_id_lookup`");

          console.log("✅ Schema migration complete: teacher_details_db supports multiple assignments per teacher");
        } finally {
          // Always re-enable FK checks
          await connection.query(`SET FOREIGN_KEY_CHECKS = 1`);
        }
      }
    }

    // Migration 2: Update teacher_student_map to include year/subject/stream context
    // This prevents students from being mapped to teachers of different years

    // First check if the table exists
    const [tableExists] = await connection.query(
      `SHOW TABLES LIKE 'teacher_student_map'`
    );

    let mapColumns = [];
    if (tableExists.length > 0) {
      // Table exists, check if it has the subject column
      [mapColumns] = await connection.query(
        `SHOW COLUMNS FROM teacher_student_map WHERE Field = 'subject'`
      );
    }

    if (mapColumns.length === 0) {
      console.log("🔧 Migration: Updating teacher_student_map schema to prevent cross-year mappings...");

      await connection.query(`SET FOREIGN_KEY_CHECKS = 0`);

      try {
        // Backup existing mappings
        await connection.query(`
          CREATE TABLE IF NOT EXISTS teacher_student_map_backup_migration AS
          SELECT * FROM teacher_student_map
        `);

        // Drop and recreate table with new schema
        await connection.query(`DROP TABLE IF EXISTS teacher_student_map`);

        await connection.query(`
          CREATE TABLE teacher_student_map (
            id INT AUTO_INCREMENT,
            teacher_id VARCHAR(50) NOT NULL,
            subject VARCHAR(100) NOT NULL,
            year VARCHAR(10) NOT NULL,
            stream VARCHAR(100) NOT NULL,
            semester VARCHAR(20) NOT NULL,
            student_id VARCHAR(50) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY unique_mapping (teacher_id, subject, year, stream, semester, student_id),
            KEY idx_teacher (teacher_id),
            KEY idx_student (student_id),
            KEY idx_year_stream (year, stream)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
        `);

        // Repopulate with correct mappings
        await connection.query(`
          INSERT INTO teacher_student_map (teacher_id, subject, year, stream, semester, student_id)
          SELECT DISTINCT t.teacher_id, t.subject, t.year, t.stream, t.semester, s.student_id
          FROM teacher_details_db t
          INNER JOIN student_details_db s 
            ON t.year = s.year 
            AND t.stream = s.stream
            AND FIND_IN_SET(s.division, t.division) > 0
          ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP
        `);

        console.log("✅ Migration complete: teacher_student_map now prevents cross-year mappings");
      } finally {
        await connection.query(`SET FOREIGN_KEY_CHECKS = 1`);
      }
    }

    // Migration 3: Add student status with default Active
    const [studentStatusColumn] = await connection.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'student_details_db'
         AND COLUMN_NAME = 'status'`,
    );

    if (studentStatusColumn.length === 0) {
      await connection.query(`
        ALTER TABLE student_details_db
        ADD COLUMN status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active' AFTER division
      `);
      console.log("🔧 Migration: Added status column to student_details_db");
    }

    await connection.query(`
      UPDATE student_details_db
      SET status = 'Active'
      WHERE status IS NULL OR status = ''
    `);

    // Migration 4: Add teacher teaching status with default Active
    const [statusColumn] = await connection.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'teacher_details_db'
         AND COLUMN_NAME = 'status'`,
    );

    if (statusColumn.length === 0) {
      await connection.query(`
        ALTER TABLE teacher_details_db
        ADD COLUMN status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active' AFTER division
      `);
      console.log("🔧 Migration: Added status column to teacher_details_db");
    }

    await connection.query(`
      UPDATE teacher_details_db
      SET status = 'Active'
      WHERE status IS NULL OR status = ''
    `);

    // Migration 5: Ensure attendance_backup has all class context columns
    const [backupColumns] = await connection.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'attendance_backup'`,
    );

    const existingBackup = new Set(backupColumns.map((row) => row.COLUMN_NAME));
    const backupAlterDefs = {
      subject: "ADD COLUMN subject VARCHAR(100) DEFAULT NULL AFTER teacher_id",
      year: "ADD COLUMN year VARCHAR(10) DEFAULT NULL AFTER subject",
      semester: "ADD COLUMN semester VARCHAR(20) DEFAULT NULL AFTER year",
      stream: "ADD COLUMN stream VARCHAR(100) DEFAULT NULL AFTER semester",
      division: "ADD COLUMN division VARCHAR(100) DEFAULT NULL AFTER stream",
      records:
        "ADD COLUMN records LONGTEXT DEFAULT NULL COMMENT 'JSON array of student records' AFTER started_at",
      file_content:
        "ADD COLUMN file_content LONGTEXT DEFAULT NULL COMMENT 'Base64-encoded CSV' AFTER records",
      saved_at: "ADD COLUMN saved_at DATETIME DEFAULT NULL AFTER file_content",
    };

    for (const [column, alterDef] of Object.entries(backupAlterDefs)) {
      if (!existingBackup.has(column)) {
        await connection.query(`ALTER TABLE attendance_backup ${alterDef}`);
        console.log(`🔧 Migration: Added missing attendance_backup.${column}`);
      }
    }

  } catch (err) {
    console.error("⚠️  Schema migration error (non-fatal):", err.message);
    // Ensure FK checks are re-enabled even on outer error
    try { await connection.query(`SET FOREIGN_KEY_CHECKS = 1`); } catch (_) { }
  } finally {
    connection.release();
  }
}

async function createDefaulterHistoryTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Defaulter_History_Lists (
        id          INT          NOT NULL AUTO_INCREMENT,
        teacher_id  VARCHAR(50)  NOT NULL,
        teacher_name VARCHAR(255) DEFAULT NULL,
        threshold   DECIMAL(5,2) NOT NULL DEFAULT 75.00,
        year        VARCHAR(10)  DEFAULT NULL,
        stream      VARCHAR(100) DEFAULT NULL,
        division    VARCHAR(50)  DEFAULT NULL,
        month       INT          DEFAULT NULL,
        defaulter_count INT      NOT NULL DEFAULT 0,
        filters_summary VARCHAR(500) DEFAULT NULL,
        defaulters_json LONGTEXT DEFAULT NULL,
        created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_dhl_teacher (teacher_id),
        KEY idx_dhl_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
    console.log("✅ Defaulter_History_Lists table ready");
  } catch (err) {
    console.error("⚠️  Defaulter_History_Lists table error (non-fatal):", err.message);
  }
}

// Run initialization
initializeDatabase().catch(console.error);
createDefaulterHistoryTable().catch(console.error);

export default initializeDatabase;
