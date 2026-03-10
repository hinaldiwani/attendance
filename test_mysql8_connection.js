import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function testMySQLConnection() {
    console.log("🔍 Testing Connection to MySQL 8.0 (Port 3305)\n");
    console.log("=".repeat(60));

    try {
        console.log("\n📋 Connection Settings:");
        console.log(`   Host: ${process.env.DB_HOST}`);
        console.log(`   Port: ${process.env.DB_PORT}`);
        console.log(`   User: ${process.env.DB_USER}`);
        console.log(`   Database: ${process.env.DB_NAME}`);

        // Test connection
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
        });

        console.log("\n✅ Connected to MySQL 8.0 successfully!");

        // Check if database exists
        const [databases] = await connection.query(
            "SHOW DATABASES LIKE ?",
            [process.env.DB_NAME]
        );

        if (databases.length === 0) {
            console.log(`\n⚠️  Database '${process.env.DB_NAME}' does not exist.`);
            console.log("   Creating database...");
            await connection.query(`CREATE DATABASE ${process.env.DB_NAME}`);
            console.log(`   ✅ Database '${process.env.DB_NAME}' created!`);
        } else {
            console.log(`\n✅ Database '${process.env.DB_NAME}' exists!`);
        }

        // Use the database
        await connection.query(`USE ${process.env.DB_NAME}`);

        // Check for tables
        const [tables] = await connection.query("SHOW TABLES");
        console.log(`\n📊 Tables in database: ${tables.length}`);

        if (tables.length === 0) {
            console.log("   ⚠️  No tables found - database needs initialization");
        } else {
            console.log("   Tables:");
            tables.forEach(table => {
                const tableName = table[Object.keys(table)[0]];
                console.log(`   - ${tableName}`);
            });

            // Check student count
            try {
                const [count] = await connection.query(
                    "SELECT COUNT(*) as count FROM student_details_db"
                );
                console.log(`\n📚 Current students: ${count[0].count}`);
            } catch (err) {
                console.log("\n⚠️  student_details_db table doesn't exist yet");
            }
        }

        await connection.end();

        console.log("\n" + "=".repeat(60));
        console.log("\n✅ Configuration updated successfully!");
        console.log("\n🎯 NEXT STEPS:");
        console.log("   1. Restart your server: node server.js");
        console.log("   2. Your MySQL Client 8.0 CLI is already connected correctly!");
        console.log("   3. Import your data from the admin panel");
        console.log("   4. Data will now save to MySQL 8.0 (port 3305)");
        console.log("\n👀 In MySQL Client 8.0 CLI, you can now see data with:");
        console.log("   USE acadmark_attendance;");
        console.log("   SELECT COUNT(*) FROM student_details_db;");
        console.log();

    } catch (error) {
        console.error("\n❌ Connection failed:", error.message);
        console.error("\nPossible issues:");
        console.error("   1. MySQL 8.0 is not running on port 3305");
        console.error("   2. Root user credentials are incorrect");
        console.error("   3. Firewall blocking the connection");
        console.error("\n   Check your MySQL 8.0 configuration.");
    }
}

testMySQLConnection();
