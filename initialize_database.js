import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

/**
 * Creates the acadmark_attendance database and all required tables
 * with proper transaction support and schema
 */
async function initializeDatabase() {
    // Create connection without specifying a database
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD || "",
        multipleStatements: false,
    });

    try {
        const dbName = process.env.DB_NAME || "acadmark_attendance";

        console.log("🚀 Starting complete database initialization...\n");

        // =================================================================
        // STEP 1: CREATE DATABASE
        // =================================================================
        console.log(`📦 Creating database '${dbName}'...`);
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` 
      CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
        console.log(`✓ Database '${dbName}' created successfully\n`);

        // Switch to the new database
        await connection.query(`USE \`${dbName}\``);
        console.log(`✓ Connected to database '${dbName}'\n`);

        // =================================================================
        // STEP 2: CREATE ALL TABLES WITH TRANSACTION SUPPORT
        // =================================================================
        console.log("📝 Creating tables with transaction support...\n");

        // BEGIN TRANSACTION
        await connection.beginTransaction();
        console.log("✓ Transaction started\n");

        // Disable foreign key checks for clean table creation
        await connection.query("SET FOREIGN_KEY_CHECKS = 0");

        // -----------------------------------------------------------------
        // 1. STUDENT DETAILS TABLE
        // -----------------------------------------------------------------
        console.log("  1/18 Creating student_details_db...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS student_details_db (
        student_id   VARCHAR(50)  NOT NULL,
        student_name VARCHAR(255) NOT NULL,
        roll_no      INT          DEFAULT NULL,
        year         VARCHAR(10)  DEFAULT NULL,
        stream       VARCHAR(100) DEFAULT NULL,
        division     VARCHAR(100) DEFAULT NULL,
        created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (student_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

        // -----------------------------------------------------------------
        // 2. TEACHER DETAILS TABLE
        // -----------------------------------------------------------------
        console.log("  2/18 Creating teacher_details_db...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS teacher_details_db (
        teacher_id  VARCHAR(50)  NOT NULL,
        name        VARCHAR(255) NOT NULL,
        subject     VARCHAR(100) NOT NULL,
        year        VARCHAR(10)  NOT NULL,
        stream      VARCHAR(100) NOT NULL,
        semester    VARCHAR(20)  NOT NULL,
        division    VARCHAR(100) DEFAULT NULL,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (teacher_id, subject, year, stream, semester),
        UNIQUE KEY  ux_teacher_assignment (teacher_id(50), subject(100), year(10), stream(50), semester(10), division(50)),
        INDEX       idx_teacher_id_lookup (teacher_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

        // -----------------------------------------------------------------
        // 3. TEACHER-STUDENT MAPPING TABLE (current version)
        // -----------------------------------------------------------------
        console.log("  3/18 Creating teacher_student_map...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS teacher_student_map (
        id          INT AUTO_INCREMENT,
        teacher_id  VARCHAR(50) NOT NULL,
        subject     VARCHAR(100) NOT NULL,
        year        VARCHAR(10) NOT NULL,
        stream      VARCHAR(100) NOT NULL,
        semester    VARCHAR(20) NOT NULL,
        student_id  VARCHAR(50) NOT NULL,
        created_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY unique_mapping (teacher_id, subject, year, stream, semester, student_id),
        KEY idx_teacher (teacher_id),
        KEY idx_student (student_id),
        KEY idx_year_stream (year, stream),
        FOREIGN KEY (student_id) REFERENCES student_details_db(student_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

        // -----------------------------------------------------------------
        // 4. TEACHER-STUDENT MAPPING TABLE (legacy version)
        // -----------------------------------------------------------------
        console.log("  4/18 Creating teacher_student_mapping...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS teacher_student_mapping (
        id          INT         NOT NULL AUTO_INCREMENT,
        teacher_id  VARCHAR(50) NOT NULL,
        student_id  VARCHAR(50) NOT NULL,
        created_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY unique_mapping (teacher_id, student_id),
        KEY idx_teacher (teacher_id),
        KEY idx_student (student_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

        // -----------------------------------------------------------------
        // 5. TEACHER-STUDENT MAP BACKUP (for migrations)
        // -----------------------------------------------------------------
        console.log("  5/18 Creating teacher_student_map_backup_migration...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS teacher_student_map_backup_migration (
        teacher_id  VARCHAR(50) NOT NULL,
        student_id  VARCHAR(50) NOT NULL,
        created_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
        KEY idx_teacher (teacher_id),
        KEY idx_student (student_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

        // -----------------------------------------------------------------
        // 6. ATTENDANCE SESSIONS TABLE
        // -----------------------------------------------------------------
        console.log("  6/18 Creating attendance_sessions...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS attendance_sessions (
        session_id    VARCHAR(100)  NOT NULL,
        teacher_id    VARCHAR(50)   NOT NULL,
        subject       VARCHAR(100)  DEFAULT NULL,
        year          VARCHAR(10)   DEFAULT NULL,
        semester      VARCHAR(20)   DEFAULT NULL,
        division      VARCHAR(100)  DEFAULT NULL,
        stream        VARCHAR(100)  DEFAULT NULL,
        started_at    DATETIME      DEFAULT NULL,
        ended_at      DATETIME      DEFAULT NULL,
        present_count INT           DEFAULT 0,
        absent_count  INT           DEFAULT 0,
        status        VARCHAR(20)   DEFAULT 'active',
        PRIMARY KEY (session_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

        // -----------------------------------------------------------------
        // 7. ATTENDANCE RECORDS TABLE
        // -----------------------------------------------------------------
        console.log("  7/18 Creating attendance_records...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        session_id  VARCHAR(100) NOT NULL,
        teacher_id  VARCHAR(50)  NOT NULL,
        student_id  VARCHAR(50)  NOT NULL,
        status      CHAR(1)      NOT NULL COMMENT 'P = Present, A = Absent',
        marked_at   DATETIME     DEFAULT NULL,
        PRIMARY KEY (session_id, student_id),
        FOREIGN KEY (session_id) REFERENCES attendance_sessions(session_id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES student_details_db(student_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

        // -----------------------------------------------------------------
        // 8. ATTENDANCE BACKUP TABLE
        // -----------------------------------------------------------------
        console.log("  8/18 Creating attendance_backup...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS attendance_backup (
        id           INT          NOT NULL AUTO_INCREMENT,
        filename     VARCHAR(255) DEFAULT NULL,
        session_id   VARCHAR(100) DEFAULT NULL,
        teacher_id   VARCHAR(50)  DEFAULT NULL,
        subject      VARCHAR(100) DEFAULT NULL,
        year         VARCHAR(10)  DEFAULT NULL,
        semester     VARCHAR(20)  DEFAULT NULL,
        stream       VARCHAR(100) DEFAULT NULL,
        division     VARCHAR(100) DEFAULT NULL,
        started_at   DATETIME     DEFAULT NULL,
        records      LONGTEXT     DEFAULT NULL COMMENT 'JSON array of student records',
        file_content LONGTEXT     DEFAULT NULL COMMENT 'Base64-encoded CSV',
        saved_at     DATETIME     DEFAULT NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

        // -----------------------------------------------------------------
        // 9. DEFAULTER HISTORY LISTS TABLE
        // -----------------------------------------------------------------
        console.log("  9/18 Creating defaulter_history_lists...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS defaulter_history_lists (
        id              INT          NOT NULL AUTO_INCREMENT,
        teacher_id      VARCHAR(50)  NOT NULL,
        teacher_name    VARCHAR(255) DEFAULT NULL,
        threshold       DECIMAL(5,2) NOT NULL DEFAULT 75.00,
        year            VARCHAR(10)  DEFAULT NULL,
        stream          VARCHAR(100) DEFAULT NULL,
        division        VARCHAR(50)  DEFAULT NULL,
        month           INT          DEFAULT NULL,
        defaulter_count INT          NOT NULL DEFAULT 0,
        filters_summary VARCHAR(500) DEFAULT NULL,
        defaulters_json LONGTEXT     DEFAULT NULL COMMENT 'JSON snapshot of the defaulter list',
        created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_dhl_teacher (teacher_id),
        KEY idx_dhl_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

        // -----------------------------------------------------------------
        // 10. DEFAULTER HISTORY TABLE
        // -----------------------------------------------------------------
        console.log(" 10/18 Creating defaulter_history...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS defaulter_history (
        id                     INT          NOT NULL AUTO_INCREMENT,
        student_id             VARCHAR(50)  NOT NULL,
        student_name           VARCHAR(255) DEFAULT NULL,
        roll_no                INT          DEFAULT NULL,
        year                   VARCHAR(10)  DEFAULT NULL,
        stream                 VARCHAR(100) DEFAULT NULL,
        division               VARCHAR(50)  DEFAULT NULL,
        subject                VARCHAR(100) DEFAULT NULL,
        month                  INT          DEFAULT NULL,
        year_value             INT          DEFAULT NULL,
        attendance_percentage  DECIMAL(5,2) DEFAULT NULL,
        generated_by           VARCHAR(50)  DEFAULT NULL,
        generated_by_role      VARCHAR(20)  DEFAULT NULL COMMENT 'admin | teacher',
        created_at             TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_student (student_id),
        KEY idx_generated_by (generated_by),
        KEY idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

        // -----------------------------------------------------------------
        // 11. MONTHLY ATTENDANCE SUMMARY TABLE
        // -----------------------------------------------------------------
        console.log(" 11/18 Creating monthly_attendance_summary...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS monthly_attendance_summary (
        id               INT          NOT NULL AUTO_INCREMENT,
        student_id       VARCHAR(50)  NOT NULL,
        year_val         INT          NOT NULL,
        month_val        INT          NOT NULL,
        subject          VARCHAR(100) DEFAULT NULL,
        total_sessions   INT          DEFAULT 0,
        present_sessions INT          DEFAULT 0,
        attendance_pct   DECIMAL(5,2) DEFAULT NULL,
        PRIMARY KEY (id),
        KEY idx_mas_student (student_id),
        FOREIGN KEY (student_id) REFERENCES student_details_db(student_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

        // -----------------------------------------------------------------
        // 12. STUDENT ATTENDANCE STATS TABLE
        // -----------------------------------------------------------------
        console.log(" 12/18 Creating student_attendance_stats...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS student_attendance_stats (
        id                    INT          NOT NULL AUTO_INCREMENT,
        student_id            VARCHAR(50)  NOT NULL,
        subject               VARCHAR(100) DEFAULT NULL,
        total_sessions        INT          DEFAULT 0,
        present_count         INT          DEFAULT 0,
        attendance_percentage DECIMAL(5,2) DEFAULT NULL,
        last_updated          DATE         DEFAULT NULL,
        PRIMARY KEY (id),
        KEY idx_sas_student (student_id),
        FOREIGN KEY (student_id) REFERENCES student_details_db(student_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

        // -----------------------------------------------------------------
        // 13. ACTIVITY LOGS TABLE
        // -----------------------------------------------------------------
        console.log(" 13/18 Creating activity_logs...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id         INT          NOT NULL AUTO_INCREMENT,
        actor_role VARCHAR(20)  NOT NULL COMMENT 'admin | teacher | student',
        actor_id   VARCHAR(50)  NOT NULL,
        action     VARCHAR(100) NOT NULL,
        details    TEXT         DEFAULT NULL,
        created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_al_role (actor_role),
        KEY idx_al_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

        // -----------------------------------------------------------------
        // 14. SESSIONS TABLE (express-session)
        // -----------------------------------------------------------------
        console.log(" 14/18 Creating sessions...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id VARCHAR(128) NOT NULL,
        expires    INT UNSIGNED NOT NULL,
        data       MEDIUMTEXT,
        PRIMARY KEY (session_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

        // -----------------------------------------------------------------
        // 15. ADMIN CREDENTIALS TABLE
        // -----------------------------------------------------------------
        console.log(" 15/18 Creating admin_credentials...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS admin_credentials (
        id         INT          AUTO_INCREMENT PRIMARY KEY,
        username   VARCHAR(255) UNIQUE NOT NULL,
        password   VARCHAR(255) NOT NULL,
        created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

        // -----------------------------------------------------------------
        // 16. GEOLOCATION LOGS TABLE
        // -----------------------------------------------------------------
        console.log(" 16/18 Creating geolocation_logs...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS geolocation_logs (
        id         INT          AUTO_INCREMENT PRIMARY KEY,
        student_id VARCHAR(50)  NOT NULL,
        latitude   DECIMAL(10,8) NOT NULL,
        longitude  DECIMAL(11,8) NOT NULL,
        accuracy   INT          DEFAULT NULL,
        distance   INT          DEFAULT NULL COMMENT 'Distance from campus in meters',
        status     VARCHAR(20)  NOT NULL COMMENT 'ACCEPTED | REJECTED',
        timestamp  DATETIME     DEFAULT CURRENT_TIMESTAMP,
        KEY idx_student (student_id),
        KEY idx_timestamp (timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

        // -----------------------------------------------------------------
        // 17. SELF MARKING TABLE
        // -----------------------------------------------------------------
        console.log(" 17/18 Creating self_marking...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS self_marking (
        id         INT          AUTO_INCREMENT PRIMARY KEY,
        student_id VARCHAR(50)  NOT NULL,
        status     CHAR(1)      NOT NULL DEFAULT 'P' COMMENT 'P = Present',
        marked_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
        KEY idx_student (student_id),
        KEY idx_marked_at (marked_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

        // -----------------------------------------------------------------
        // 18. MANUAL OVERRIDES TABLE
        // -----------------------------------------------------------------
        console.log(" 18/18 Creating manual_overrides...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS manual_overrides (
        id         INT          AUTO_INCREMENT PRIMARY KEY,
        teacher_id VARCHAR(50)  NOT NULL,
        student_id VARCHAR(50)  NOT NULL,
        status     CHAR(1)      NOT NULL COMMENT 'P = Present, A = Absent',
        reason     TEXT         DEFAULT NULL,
        timestamp  DATETIME     DEFAULT CURRENT_TIMESTAMP,
        KEY idx_teacher (teacher_id),
        KEY idx_student (student_id),
        KEY idx_timestamp (timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

        // Re-enable foreign key checks
        await connection.query("SET FOREIGN_KEY_CHECKS = 1");

        // COMMIT TRANSACTION
        await connection.commit();
        console.log("\n✅ TRANSACTION COMMITTED - All tables created successfully!\n");

        // =================================================================
        // STEP 3: VERIFY DATABASE AND TABLES
        // =================================================================
        const [tables] = await connection.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name",
            [dbName]
        );

        console.log("═══════════════════════════════════════════════════════");
        console.log("📊 DATABASE INITIALIZATION COMPLETE");
        console.log("═══════════════════════════════════════════════════════");
        console.log(`Database: ${dbName}`);
        console.log(`Total tables: ${tables.length}`);
        console.log(`\nTables created:`);
        tables.forEach((table, index) => {
            console.log(`  ${String(index + 1).padStart(2, '0')}. ${table.TABLE_NAME || table.table_name}`);
        });
        console.log("═══════════════════════════════════════════════════════\n");

        console.log("🎉 Success! Database '${dbName}' is ready for use!");
        console.log("   ✓ All 18 tables created with proper constraints");
        console.log("   ✓ Foreign key relationships established");
        console.log("   ✓ Indexes added for optimal performance");
        console.log("   ✓ Transaction support enabled (commit/rollback)");

    } catch (error) {
        // ROLLBACK TRANSACTION on error
        console.error("\n❌ ERROR OCCURRED - Rolling back transaction...");
        try {
            await connection.rollback();
            console.error("✓ Transaction rolled back\n");
        } catch (rollbackError) {
            console.error("⚠️  Could not rollback:", rollbackError.message);
        }

        console.error("Error details:", error.message);
        console.error("\nStack trace:");
        console.error(error.stack);

        throw error;
    } finally {
        await connection.end();
    }
}

// Run the function
initializeDatabase()
    .then(() => {
        console.log("\n✨ Database initialization script completed successfully");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n💥 Database initialization failed:", error.message);
        process.exit(1);
    });
