import pool from "./config/db.js";

async function dropAllTables() {
    const connection = await pool.getConnection();

    try {
        console.log("Fetching all tables from markin_attendance database...");

        // Get all tables in the database
        const [tables] = await connection.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = ?",
            [process.env.DB_NAME || "markin_attendance"]
        );

        if (tables.length === 0) {
            console.log("No tables found in the database.");
            return;
        }

        console.log(`Found ${tables.length} tables:`);
        tables.forEach((table, index) => {
            console.log(`  ${index + 1}. ${table.TABLE_NAME || table.table_name}`);
        });

        // Disable foreign key checks
        console.log("\nDisabling foreign key checks...");
        await connection.query("SET FOREIGN_KEY_CHECKS = 0");

        // Drop each table
        console.log("\nDropping tables...");
        for (const table of tables) {
            const tableName = table.TABLE_NAME || table.table_name;
            console.log(`  Dropping ${tableName}...`);
            await connection.query(`DROP TABLE IF EXISTS \`${tableName}\``);
        }

        // Re-enable foreign key checks
        console.log("\nRe-enabling foreign key checks...");
        await connection.query("SET FOREIGN_KEY_CHECKS = 1");

        console.log("\n✓ All tables dropped successfully!");

    } catch (error) {
        console.error("Error dropping tables:", error);
        throw error;
    } finally {
        connection.release();
        await pool.end();
    }
}

dropAllTables()
    .then(() => {
        console.log("\nDatabase cleanup complete.");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\nFailed to drop tables:", error);
        process.exit(1);
    });
