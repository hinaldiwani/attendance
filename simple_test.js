import pool from "./config/db.js";

async function simpleTest() {
    console.log("🧪 SIMPLE DATABASE TEST\n");

    const connection = await pool.getConnection();

    try {
        // Insert test record
        const testId = 'TEST_MYSQL_CLIENT_VERIFY';

        console.log("1️⃣ Inserting test record...");
        await connection.query(
            `INSERT INTO student_details_db 
            (student_id, student_name, roll_no, year, stream, division) 
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE student_name = VALUES(student_name)`,
            [testId, '⭐⭐⭐ CHECK YOUR MYSQL CLIENT NOW ⭐⭐⭐', '99999', 'TEST', 'VERIFY', 'Z']
        );
        console.log("   ✅ Test record inserted!\n");

        // Show count
        const [count] = await connection.query(`SELECT COUNT(*) as count FROM student_details_db`);
        console.log(`2️⃣ Total students in database: ${count[0].count}\n`);

        console.log("=".repeat(60));
        console.log("\n📋 NOW RUN THIS IN YOUR MySQL Client 8.0 CLI:\n");
        console.log("   USE acadmark_attendance;");
        console.log("   SELECT COUNT(*) FROM student_details_db;");
        console.log(`   SELECT * FROM student_details_db WHERE student_id = '${testId}';\n`);
        console.log("RESULTS:");
        console.log(`   ✅ If COUNT = ${count[0].count} and you see the ⭐ record:`);
        console.log("      → Both are connected to SAME database!");
        console.log("      → Data IS saving, just need to refresh/reconnect MySQL Client\n");
        console.log("   ❌ If COUNT = 0 or you don't see ⭐ record:");
        console.log("      → MySQL Client is connected to WRONG database");
        console.log("      → Need to reconfigure MySQL Client connection\n");
        console.log("=".repeat(60));
        console.log("\nTest record will auto-delete in 30 seconds...\n");

        // Wait 30 seconds
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Cleanup
        console.log("🧹 Cleaning up test record...");
        await connection.query(`DELETE FROM student_details_db WHERE student_id = ?`, [testId]);
        console.log("   ✅ Done!\n");

    } catch (error) {
        console.error("❌ Error:", error.message);
    } finally {
        connection.release();
        await pool.end();
    }
}

simpleTest();
