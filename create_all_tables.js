import pool from "./config/db.js";

/**
 * Creates all necessary database tables with proper transaction support
 * Includes commit and rollback functionality to ensure data integrity
 */
async function createAllTables() {
    const connection = await pool.getConnection();

    try {
        console.log("🚀 Starting database table creation with transaction support...\n");

        // BEGIN TRANSACTION
        await connection.beginTransaction();
        console.log("✓ Transaction started\n");

        // Disable foreign key checks for clean table creation
        await connection.query("SET FOREIGN_KEY_CHECKS = 0");
        console.log("✓ Foreign key checks disabled\n");

        // =================================================================
        // 1. STUDENT DETAILS TABLE
        // =================================================================
        console.log("📝 Creating student_details_db...");
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
        console.log("  ✓ student_details_db created\n");

        // =================================================================
        // 2. TEACHER DETAILS TABLE
        // =================================================================
        console.log("📝 Creating teacher_details_db...");
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
        console.log("  ✓ teacher_details_db created\n");

        // =================================================================
        // 3. TEACHER-STUDENT MAPPING TABLE
        // =================================================================
        console.log("📝 Creating teacher_student_map...");
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
        console.log("  ✓ teacher_student_map created\n");

        // =================================================================
        // 4. ATTENDANCE SESSIONS TABLE
        // =================================================================
        console.log("📝 Creating attendance_sessions...");
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
        console.log("  ✓ attendance_sessions created\n");

        // =================================================================
        // 5. ATTENDANCE RECORDS TABLE
        // =================================================================
        console.log("📝 Creating attendance_records...");
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
        console.log("  ✓ attendance_records created\n");

        // =================================================================
        // 6. ATTENDANCE BACKUP TABLE
        // =================================================================
        console.log("📝 Creating attendance_backup...");
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
        console.log("  ✓ attendance_backup created\n");

        // =================================================================
        // 7. DEFAULTER HISTORY LISTS TABLE
        // =================================================================
        console.log("📝 Creating Defaulter_History_Lists...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS Defaulter_History_Lists (
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
        console.log("  ✓ Defaulter_History_Lists created\n");

        // =================================================================
        // 8. MONTHLY ATTENDANCE SUMMARY TABLE
        // =================================================================
        console.log("📝 Creating monthly_attendance_summary...");
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
        console.log("  ✓ monthly_attendance_summary created\n");

        // =================================================================
        // 9. STUDENT ATTENDANCE STATS TABLE
        // =================================================================
        console.log("📝 Creating student_attendance_stats...");
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
        console.log("  ✓ student_attendance_stats created\n");

        // =================================================================
        // 10. ACTIVITY LOGS TABLE
        // =================================================================
        console.log("📝 Creating activity_logs...");
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
        console.log("  ✓ activity_logs created\n");

        // =================================================================
        // 11. SESSIONS TABLE (express-session)
        // =================================================================
        console.log("📝 Creating sessions...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id VARCHAR(128) NOT NULL,
        expires    INT UNSIGNED NOT NULL,
        data       MEDIUMTEXT,
        PRIMARY KEY (session_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
        console.log("  ✓ sessions created\n");

        // =================================================================
        // 12. ADMIN CREDENTIALS TABLE
        // =================================================================
        console.log("📝 Creating admin_credentials...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS admin_credentials (
        id         INT          AUTO_INCREMENT PRIMARY KEY,
        username   VARCHAR(255) UNIQUE NOT NULL,
        password   VARCHAR(255) NOT NULL,
        created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
        console.log("  ✓ admin_credentials created\n");

        // =================================================================
        // 13. GEOLOCATION LOGS TABLE
        // =================================================================
        console.log("📝 Creating geolocation_logs...");
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
        console.log("  ✓ geolocation_logs created\n");

        // =================================================================
        // 14. SELF MARKING TABLE
        // =================================================================
        console.log("📝 Creating self_marking...");
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
        console.log("  ✓ self_marking created\n");

        // =================================================================
        // 15. MANUAL OVERRIDES TABLE
        // =================================================================
        console.log("📝 Creating manual_overrides...");
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
        console.log("  ✓ manual_overrides created\n");

        // Re-enable foreign key checks
        await connection.query("SET FOREIGN_KEY_CHECKS = 1");
        console.log("✓ Foreign key checks re-enabled\n");

        // COMMIT TRANSACTION
        await connection.commit();
        console.log("✅ TRANSACTION COMMITTED - All tables created successfully!\n");

        // Verify tables were created
        const [tables] = await connection.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = ?",
            [process.env.DB_NAME || "markin_attendance"]
        );

        console.log("═══════════════════════════════════════════════════════");
        console.log("📊 DATABASE CREATION SUMMARY");
        console.log("═══════════════════════════════════════════════════════");
        console.log(`Total tables created: ${tables.length}\n`);
        console.log("Tables list:");
        tables.forEach((table, index) => {
            console.log(`  ${index + 1}. ${table.TABLE_NAME || table.table_name}`);
        });
        console.log("═══════════════════════════════════════════════════════\n");

        console.log("🎉 Database initialization complete!");
        console.log("   All tables have been created with proper constraints and indexes.");
        console.log("   Foreign key relationships are properly established.");

    } catch (error) {
        // ROLLBACK TRANSACTION on error
        console.error("\n❌ ERROR OCCURRED - Rolling back transaction...");
        await connection.rollback();
        console.error("✓ Transaction rolled back - no changes were made to the database\n");

        console.error("Error details:", error.message);
        console.error("\nStack trace:");
        console.error(error.stack);

        throw error;
    } finally {
        // Always release the connection
        connection.release();
        await pool.end();
    }
}

// Run the function
createAllTables()
    .then(() => {
        console.log("\n✨ Script completed successfully");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n💥 Script failed:", error.message);
        process.exit(1);
    });
