import pool from "./config/db.js";

async function testConnection() {
    try {
        console.log("🔍 Testing MySQL connection...\n");

        const [dbInfo] = await pool.query("SELECT DATABASE() as current_db, VERSION() as mysql_version");
        console.log("✅ Connected to MySQL successfully!");
        console.log(`   Database: ${dbInfo[0].current_db}`);
        console.log(`   MySQL Version: ${dbInfo[0].mysql_version}\n`);

        const [tables] = await pool.query(
            "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = ?",
            [dbInfo[0].current_db]
        );
        console.log(`✅ Total tables in database: ${tables[0].table_count}`);

        const [tableList] = await pool.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name",
            [dbInfo[0].current_db]
        );

        console.log("\n📋 Available tables:");
        tableList.forEach((table, index) => {
            console.log(`   ${String(index + 1).padStart(2, '0')}. ${table.TABLE_NAME || table.table_name}`);
        });

        console.log("\n✅ Project is successfully connected to MySQL 8.0 CLI!");
        console.log("   Your application can now access the database.\n");

        await pool.end();
        process.exit(0);

    } catch (error) {
        console.error("❌ Connection failed:", error.message);
        process.exit(1);
    }
}

testConnection();
