import pool from "./config/db.js";

async function deleteTestStudent() {
    console.log("🗑️  Deleting test student record...\n");

    const connection = await pool.getConnection();

    try {
        // Check current count
        const [before] = await connection.query("SELECT COUNT(*) as count FROM student_details_db");
        console.log(`Students before: ${before[0].count}`);

        // Delete the test record
        const [result] = await connection.query(
            "DELETE FROM student_details_db WHERE student_id = 'TEST_FINAL'"
        );

        console.log(`✅ Deleted ${result.affectedRows} record(s)`);

        // Check final count
        const [after] = await connection.query("SELECT COUNT(*) as count FROM student_details_db");
        console.log(`Students after: ${after[0].count}`);

        console.log("\n✅ Test record deleted successfully!\n");

    } catch (error) {
        console.error("❌ Error:", error.message);
    } finally {
        connection.release();
        await pool.end();
    }
}

deleteTestStudent();
