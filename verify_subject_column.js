import pool from "./config/db.js";

async function verifySubjectColumn() {
  try {
    const [columns] = await pool.query(
      "SHOW COLUMNS FROM teacher_details_db"
    );

    console.log("\n✅ teacher_details_db table structure:");
    console.log("=".repeat(50));
    columns.forEach((col) => {
      const highlight = col.Field === 'subject' ? '✓' : ' ';
      console.log(`${highlight} ${col.Field.padEnd(15)} ${col.Type.padEnd(20)} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    const hasSubject = columns.some(col => col.Field === 'subject');
    console.log("\n" + "=".repeat(50));
    console.log(hasSubject ? '✅ FIXED: subject column exists!' : '❌ ERROR: subject column still missing!');

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await pool.end();
  }
}

verifySubjectColumn();
