import pool from "./config/db.js";

async function insertTestRecord() {
    console.log("🧪 INSERTING TEST RECORD TO VERIFY DATABASE CONNECTION\n");
    console.log("=".repeat(60));

    const connection = await pool.getConnection();

    try {
        // Insert a very obvious test record
        const testId = `TEST_${Date.now()}`;
        const testName = `⭐ VERIFICATION RECORD - CHECK IN MYSQL CLIENT 8.0 ⭐`;

        console.log("📝 Inserting test record...");
        console.log(`   Student ID: ${testId}`);
        console.log(`   Student Name: ${testName}`);

        await connection.query(
            `INSERT INTO student_details_db 
            (student_id, student_name, roll_no, year, stream, division) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [testId, testName, '99999', 'TEST', 'VERIFY', 'Z']
        );

        console.log("   ✅ Record inserted!");

        // Verify it's there
        const [check] = await connection.query(
            `SELECT * FROM student_details_db WHERE student_id = ?`,
            [testId]
        );

        if (check.length > 0) {
            console.log("   ✅ Record verified in database!");
            console.log(`\n📊 Total students in database: `);
            const [count] = await connection.query(`SELECT COUNT(*) as count FROM student_details_db`);
            console.log(`   ${count[0].count} students`);
        }

        console.log("\n" + "=".repeat(60));
        console.log("\n🎯 NOW GO TO YOUR MySQL Client 8.0 CLI AND RUN:\n");
        console.log("   USE acadmark_attendance;");
        console.log("   SELECT COUNT(*) FROM student_details_db;");
        console.log(`   SELECT * FROM student_details_db WHERE student_id = '${testId}';`);
        console.log("\n   If you see this test record, then both are connected!");
        console.log("   If you DON'T see it, they're connected to different databases.");
        console.log("\n" + "=".repeat(60));
        console.log("\n⏸️  Press Ctrl+C when done checking...\n");

        // Keep the connection alive so user can check
        await new Promise(resolve => {
            process.stdin.once('data', resolve);
        });

        // Cleanup
        console.log("\n🧹 Cleaning up test record...");
        await connection.query(
            `DELETE FROM student_details_db WHERE student_id = ?`,
            [testId]
        );
        console.log("   ✅ Test record removed");

    } catch (error) {
        console.error("\n❌ Error:", error.message);
    } finally {
        connection.release();
        await pool.end();
    }
}

insertTestRecord();
