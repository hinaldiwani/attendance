import pool from "./config/db.js";

async function checkColumns() {
  try {
    const [columns] = await pool.query(`
      SHOW COLUMNS FROM teacher_details_db
    `);

    console.log("\n✅ Columns in teacher_details_db table:");
    console.log("=========================================");
    columns.forEach(col => {
      console.log(`- ${col.Field} (${col.Type}) ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    const hasSubject = columns.some(col => col.Field === 'subject');
    console.log(`\n${hasSubject ? '✅' : '❌'} 'subject' column ${hasSubject ? 'EXISTS' : 'DOES NOT EXIST'}`);

  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await pool.end();
  }
}

checkColumns();
