import { pool } from "./config/db.js";

async function checkCSVData() {
  try {
    const [rows] = await pool.query(
      "SELECT id, filename, LEFT(file_content, 150) as sample, LENGTH(file_content) as content_length FROM attendance_backup ORDER BY id DESC LIMIT 3",
    );

    console.log("\n=== Recent Attendance Backups ===\n");

    for (const row of rows) {
      console.log(`ID: ${row.id}`);
      console.log(`Filename: ${row.filename}`);
      console.log(`Content Length: ${row.content_length} bytes`);
      console.log(`Sample (first 150 chars): ${row.sample}`);

      // Try to decode and show first few characters
      if (row.sample) {
        try {
          const decoded = Buffer.from(row.sample, "base64").toString("utf-8");
          console.log(`Decoded sample: ${decoded.substring(0, 100)}`);
        } catch (err) {
          console.log(`Failed to decode: ${err.message}`);
        }
      }
      console.log("\n---\n");
    }

    await pool.end();
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

checkCSVData();
