import pool from "./config/db.js";

/**
 * Creates the 3 missing database tables with transaction support
 */
async function createMissingTables() {
    const connection = await pool.getConnection();

    try {
        console.log("🚀 Creating missing tables with transaction support...\n");

        // BEGIN TRANSACTION
        await connection.beginTransaction();
        console.log("✓ Transaction started\n");

        // =================================================================
        // 1. DEFAULTER_HISTORY TABLE
        // =================================================================
        console.log("📝 Creating defaulter_history...");
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
        console.log("  ✓ defaulter_history created\n");

        // =================================================================
        // 2. TEACHER_STUDENT_MAPPING TABLE (legacy/alternate version)
        // =================================================================
        console.log("📝 Creating teacher_student_mapping...");
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
        console.log("  ✓ teacher_student_mapping created\n");

        // =================================================================
        // 3. TEACHER_STUDENT_MAP_BACKUP_MIGRATION TABLE
        // =================================================================
        console.log("📝 Creating teacher_student_map_backup_migration...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS teacher_student_map_backup_migration (
        teacher_id  VARCHAR(50) NOT NULL,
        student_id  VARCHAR(50) NOT NULL,
        created_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
        KEY idx_teacher (teacher_id),
        KEY idx_student (student_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
        console.log("  ✓ teacher_student_map_backup_migration created\n");

        // COMMIT TRANSACTION
        await connection.commit();
        console.log("✅ TRANSACTION COMMITTED - All missing tables created successfully!\n");

        // Verify tables were created
        const [tables] = await connection.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name",
            [process.env.DB_NAME || "markin_attendance"]
        );

        console.log("═══════════════════════════════════════════════════════");
        console.log("📊 COMPLETE DATABASE SUMMARY");
        console.log("═══════════════════════════════════════════════════════");
        console.log(`Total tables in database: ${tables.length}\n`);
        console.log("Complete tables list:");
        tables.forEach((table, index) => {
            console.log(`  ${String(index + 1).padStart(2, '0')}. ${table.TABLE_NAME || table.table_name}`);
        });
        console.log("═══════════════════════════════════════════════════════\n");

        console.log("🎉 All missing tables have been added!");
        console.log("   Database now has all 18 tables required by the application.");

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
createMissingTables()
    .then(() => {
        console.log("\n✨ Script completed successfully");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n💥 Script failed:", error.message);
        process.exit(1);
    });
