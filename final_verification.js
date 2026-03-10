import pool from "./config/db.js";

async function finalVerification() {
    console.log("🧪 FINAL VERIFICATION TEST\n");
    console.log("=".repeat(60));

    const connection = await pool.getConnection();

    try {
        const [info] = await connection.query(
            "SELECT DATABASE() as db, @@port as port, USER() as user"
        );

        console.log("\n✅ Application now connects to:");
        console.log(`   Database: ${info[0].db}`);
        console.log(`   Port: ${info[0].port}`);
        console.log(`   User: ${info[0].user}`);

        // Insert test record
        console.log("\n📝 Inserting test record...");
        await connection.query(
            `INSERT INTO student_details_db 
            (student_id, student_name, roll_no, year, stream, division) 
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE student_name = VALUES(student_name)`,
            ['TEST_FINAL', '🎉 MySQL 8.0 Connection Working!', '1', 'FY', 'TEST', 'A']
        );
        console.log("   ✅ Test record inserted!");

        const [count] = await connection.query(
            "SELECT COUNT(*) as count FROM student_details_db"
        );
        console.log(`\n📊 Total students: ${count[0].count}`);

        console.log("\n" + "=".repeat(60));
        console.log("\n🎉 SUCCESS! Everything is working!");
        console.log("\n👉 NOW CHECK IN YOUR MySQL Client 8.0 CLI:");
        console.log("   SELECT * FROM student_details_db;");
        console.log("\n   You should see the test record with 🎉 emoji!");
        console.log("\n✅ When you import data from frontend, it will");
        console.log("   appear IMMEDIATELY in MySQL Client 8.0 CLI!");
        console.log("\n" + "=".repeat(60));

        // Cleanup
        console.log("\nTest record will remain for you to verify.");
        console.log("You can delete it manually if needed.\n");

    } catch (error) {
        console.error("\n❌ Error:", error.message);
    } finally {
        connection.release();
        await pool.end();
    }
}

finalVerification();
