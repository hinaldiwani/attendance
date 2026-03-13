import pool from "./config/db.js";

async function addStatusColumn() {
    const connection = await pool.getConnection();

    try {
        // Check if status column exists
        const [columns] = await connection.query("SHOW COLUMNS FROM teacher_details_db LIKE 'status'");

        if (columns.length === 0) {
            await connection.query(`
                ALTER TABLE teacher_details_db 
                ADD COLUMN status ENUM('Active', 'Inactive') DEFAULT 'Active' AFTER division
            `);
            console.log("✅ Status column added to teacher_details_db");
        } else {
            console.log("⚠️  Status column already exists in teacher_details_db");
        }

        // Set all existing teachers to Active
        await connection.query("UPDATE teacher_details_db SET status = 'Active' WHERE status IS NULL");

        console.log("✅ All existing teachers set to Active status");

    } catch (error) {
        console.error("❌ Error:", error.message);
    } finally {
        connection.release();
        await pool.end();
    }
}

addStatusColumn();
