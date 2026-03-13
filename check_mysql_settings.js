import pool from "./config/db.js";

async function checkMySQLSettings() {
    const connection = await pool.getConnection();
    try {
        console.log("🔍 Checking MySQL Settings...\n");

        // Check autocommit setting
        const [autocommit] = await connection.query("SELECT @@autocommit");
        console.log("✓ Autocommit:", autocommit[0]['@@autocommit'] === 1 ? "ENABLED" : "DISABLED");

        // Check transaction isolation level (MariaDB compatible)
        try {
            const [isolation] = await connection.query("SELECT @@tx_isolation");
            console.log("✓ Transaction Isolation:", isolation[0]['@@tx_isolation']);
        } catch (err) {
            console.log("✓ Transaction Isolation: (not available)");
        }

        // Check max_allowed_packet
        const [maxPacket] = await connection.query("SELECT @@max_allowed_packet");
        console.log("✓ Max Allowed Packet:", Math.floor(maxPacket[0]['@@max_allowed_packet'] / 1024 / 1024), "MB");

        // Check if tables exist and their row counts
        console.log("\n📊 Table Row Counts:");
        const [students] = await connection.query("SELECT COUNT(*) as count FROM student_details_db");
        console.log("   - student_details_db:", students[0].count);

        const [teachers] = await connection.query("SELECT COUNT(*) as count FROM teacher_details_db");
        console.log("   - teacher_details_db:", teachers[0].count);

        const [mappings] = await connection.query("SELECT COUNT(*) as count FROM teacher_student_map");
        console.log("   - teacher_student_map:", mappings[0].count);

        // Test a simple insert and rollback
        console.log("\n🧪 Testing Transaction Behavior:");
        await connection.beginTransaction();
        await connection.query("INSERT INTO student_details_db (student_id, student_name, roll_no, year, stream, division) VALUES ('TEST001', 'Test Student', '999', 'FY', 'TEST', 'A')");
        console.log("   - Inserted test record");

        const [afterInsert] = await connection.query("SELECT COUNT(*) as count FROM student_details_db WHERE student_id = 'TEST001'");
        console.log("   - Test record visible in transaction:", afterInsert[0].count);

        await connection.rollback();
        console.log("   - Rolled back transaction");

        const [afterRollback] = await connection.query("SELECT COUNT(*) as count FROM student_details_db WHERE student_id = 'TEST001'");
        console.log("   - Test record after rollback:", afterRollback[0].count, "(should be 0)");

        console.log("\n✅ All checks completed!");

    } catch (error) {
        console.error("\n❌ Error:", error.message);
    } finally {
        connection.release();
        await pool.end();
    }
}

checkMySQLSettings();
