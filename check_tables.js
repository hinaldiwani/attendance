import pool from "./config/db.js";

async function checkTables() {
    const connection = await pool.getConnection();

    try {
        const [tables] = await connection.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = ?",
            [process.env.DB_NAME || "markin_attendance"]
        );

        if (tables.length === 0) {
            console.log("✓ Database is empty - no tables found.");
        } else {
            console.log(`Found ${tables.length} table(s):`);
            tables.forEach((table, index) => {
                console.log(`  ${index + 1}. ${table.TABLE_NAME || table.table_name}`);
            });
        }

    } catch (error) {
        console.error("Error checking tables:", error);
    } finally {
        connection.release();
        await pool.end();
    }
}

checkTables();
