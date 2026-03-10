import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

/**
 * Verifies MySQL connection and lists all databases
 */
async function verifyConnection() {
    try {
        console.log("🔍 Checking MySQL connection and databases...\n");

        console.log("Connection details:");
        console.log(`  Host: ${process.env.DB_HOST || 'localhost'}`);
        console.log(`  Port: ${process.env.DB_PORT || 3306}`);
        console.log(`  User: ${process.env.DB_USER}`);
        console.log(`  Database Name: ${process.env.DB_NAME}\n`);

        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD || "",
        });

        console.log("✓ Successfully connected to MySQL server\n");

        // List all databases
        const [databases] = await connection.query("SHOW DATABASES");

        console.log("═══════════════════════════════════════════════════════");
        console.log("📊 ALL DATABASES ON THIS SERVER:");
        console.log("═══════════════════════════════════════════════════════");
        databases.forEach((db, index) => {
            const dbName = db.Database || db.DATABASE;
            const marker = dbName === process.env.DB_NAME ? ' ← TARGET DATABASE' : '';
            console.log(`  ${String(index + 1).padStart(2, '0')}. ${dbName}${marker}`);
        });
        console.log("═══════════════════════════════════════════════════════\n");

        // Check if our target database exists
        const targetDb = process.env.DB_NAME || "acadmark_attendance";
        const found = databases.find(db =>
            (db.Database || db.DATABASE) === targetDb
        );

        if (found) {
            console.log(`✅ Target database '${targetDb}' EXISTS on this server\n`);

            // Switch to the database and list tables
            await connection.query(`USE \`${targetDb}\``);
            const [tables] = await connection.query("SHOW TABLES");

            console.log(`Tables in '${targetDb}': ${tables.length}`);
            if (tables.length > 0) {
                tables.forEach((table, index) => {
                    const tableName = Object.values(table)[0];
                    console.log(`  ${String(index + 1).padStart(2, '0')}. ${tableName}`);
                });
            }
        } else {
            console.log(`❌ Target database '${targetDb}' NOT FOUND on this server`);
            console.log(`\nThe database may have been created on a different MySQL instance.`);
            console.log(`Please verify your .env configuration.`);
        }

        await connection.end();

    } catch (error) {
        console.error("\n❌ Connection Error:", error.message);
        console.error("\nPossible issues:");
        console.error("  1. MySQL server not running");
        console.error("  2. Wrong host/port in .env file");
        console.error("  3. Invalid credentials");
        console.error("  4. Firewall blocking connection");
        throw error;
    }
}

verifyConnection()
    .then(() => {
        console.log("\n✨ Verification complete");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n💥 Verification failed");
        process.exit(1);
    });
