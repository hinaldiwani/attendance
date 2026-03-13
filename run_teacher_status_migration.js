import pool from "./config/db.js";
import fs from "fs";

async function createTeacherStatusTable() {
    console.log("📦 Creating teacher_status_backup table...\n");

    const connection = await pool.getConnection();

    try {
        // Read the SQL file
        const sql = fs.readFileSync("./create_teacher_status_table.sql", "utf8");

        // Split and execute each statement
        const statements = sql.split(";").map(s => s.trim()).filter(s => s.length > 0);

        for (const statement of statements) {
            try {
                await connection.query(statement);
                console.log("✅ Executed:", statement.substring(0, 50) + "...");
            } catch (err) {
                if (err.message.includes("Duplicate column")) {
                    console.log("⚠️  Column already exists, skipping...");
                } else {
                    console.error("❌ Error:", err.message);
                }
            }
        }

        // Verify table creation
        const [tables] = await connection.query("SHOW TABLES LIKE 'teacher_status_backup'");
        if (tables.length > 0) {
            console.log("\n✅ teacher_status_backup table created successfully!");

            // Check structure
            const [columns] = await connection.query("DESCRIBE teacher_status_backup");
            console.log("\n📋 Table structure:");
            columns.forEach(col => {
                console.log(`   - ${col.Field}: ${col.Type}`);
            });
        }

        // Check if status column was added to teacher_details_db
        const [teacherCols] = await connection.query("DESCRIBE teacher_details_db");
        const hasStatus = teacherCols.some(col => col.Field === 'status');
        if (hasStatus) {
            console.log("\n✅ Status column added to teacher_details_db");
        }

        console.log("\n✅ Database schema updated successfully!\n");

    } catch (error) {
        console.error("❌ Error:", error.message);
    } finally {
        connection.release();
        await pool.end();
    }
}

createTeacherStatusTable();
