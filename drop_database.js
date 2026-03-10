import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

/**
 * Drops the entire markin_attendance database
 * WARNING: This is a destructive operation that cannot be undone!
 */
async function dropDatabase() {
    // Create connection without specifying a database
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD || "",
        multipleStatements: false,
    });

    try {
        const dbName = process.env.DB_NAME || "markin_attendance";

        console.log("⚠️  WARNING: About to delete entire database!");
        console.log(`Database name: ${dbName}\n`);

        // Check if database exists
        const [databases] = await connection.query(
            "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?",
            [dbName]
        );

        if (databases.length === 0) {
            console.log(`✓ Database '${dbName}' does not exist. Nothing to delete.`);
            return;
        }

        console.log(`Found database: ${dbName}`);

        // Check tables count before deletion
        const [tables] = await connection.query(
            "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = ?",
            [dbName]
        );
        const tableCount = tables[0].count;
        console.log(`Tables in database: ${tableCount}\n`);

        // Drop the database
        console.log(`🗑️  Dropping database '${dbName}'...`);
        await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\``);

        console.log(`✅ Database '${dbName}' has been successfully deleted!\n`);

        // Verify deletion
        const [verify] = await connection.query(
            "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?",
            [dbName]
        );

        if (verify.length === 0) {
            console.log("═══════════════════════════════════════════════════════");
            console.log("✓ VERIFICATION COMPLETE");
            console.log("═══════════════════════════════════════════════════════");
            console.log(`Database '${dbName}' no longer exists in the system.`);
            console.log("All tables and data have been permanently removed.");
            console.log("═══════════════════════════════════════════════════════");
        } else {
            console.log("⚠️  Warning: Database still exists after drop command!");
        }

    } catch (error) {
        console.error("\n❌ Error dropping database:", error.message);
        throw error;
    } finally {
        await connection.end();
    }
}

// Run the function
dropDatabase()
    .then(() => {
        console.log("\n✨ Database deletion completed");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n💥 Failed to drop database:", error.message);
        process.exit(1);
    });
