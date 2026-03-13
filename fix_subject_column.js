import pool from "./config/db.js";

async function fixSubjectColumn() {
  const connection = await pool.getConnection();

  try {
    console.log("🔍 Checking teacher_details_db table structure...\n");

    // Check if subject column exists
    const [columns] = await connection.query(
      "SHOW COLUMNS FROM teacher_details_db LIKE 'subject'"
    );

    if (columns.length === 0) {
      console.log("❌ 'subject' column is missing!");
      console.log("🔧 Adding 'subject' column to teacher_details_db...\n");

      // Add the subject column
      await connection.query(`
        ALTER TABLE teacher_details_db 
        ADD COLUMN subject VARCHAR(100) NOT NULL AFTER name
      `);

      console.log("✅ 'subject' column added successfully!");

      // Show updated structure
      const [newColumns] = await connection.query(
        "SHOW COLUMNS FROM teacher_details_db"
      );
      console.log("\n📋 Updated table structure:");
      newColumns.forEach((col) => {
        console.log(`   - ${col.Field} (${col.Type})`);
      });
    } else {
      console.log("✅ 'subject' column already exists!");
      console.log("\n📋 Current table structure:");
      const [allColumns] = await connection.query(
        "SHOW COLUMNS FROM teacher_details_db"
      );
      allColumns.forEach((col) => {
        console.log(`   - ${col.Field} (${col.Type})`);
      });
    }
  } catch (error) {
    console.error("❌ Error:", error.message);

    if (error.message.includes("Duplicate column")) {
      console.log("\n⚠️  The 'subject' column already exists. The database might be in an inconsistent state.");
      console.log("💡 Consider running the initialization script: node MARKIN\\initialize_database.js");
    }
  } finally {
    connection.release();
    await pool.end();
  }
}

fixSubjectColumn();
