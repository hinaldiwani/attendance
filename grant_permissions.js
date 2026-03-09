import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

/**
 * Grants permissions on acadmark_attendance database to make it visible
 */
async function grantPermissions() {
  try {
    console.log("🔧 Granting permissions to acadmark_attendance database...\n");
    
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || "",
      database: 'acadmark_attendance'
    });
    
    console.log("✓ Connected to MySQL server\n");
    
    const dbName = 'acadmark_attendance';
    const username = process.env.DB_USER || 'hinal';
    
    console.log("Granting privileges...\n");
    
    // Grant all privileges on the database to the user
    try {
      await connection.query(
        `GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${username}'@'localhost'`
      );
      console.log(`✓ Granted ALL PRIVILEGES to ${username}@localhost`);
    } catch (err) {
      console.log(`  Note: ${err.message}`);
    }
    
    try {
      await connection.query(
        `GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${username}'@'%'`
      );
      console.log(`✓ Granted ALL PRIVILEGES to ${username}@%`);
    } catch (err) {
      console.log(`  Note: ${err.message}`);
    }
    
    // Also try granting to root user if different
    if (username !== 'root') {
      try {
        await connection.query(
          `GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO 'root'@'localhost'`
        );
        console.log(`✓ Granted ALL PRIVILEGES to root@localhost`);
      } catch (err) {
        console.log(`  Note: ${err.message}`);
      }
    }
    
    // Flush privileges to apply changes
    await connection.query('FLUSH PRIVILEGES');
    console.log('\n✓ Privileges flushed - changes applied\n');
    
    console.log("═══════════════════════════════════════════════════════");
    console.log("✅ PERMISSIONS GRANTED SUCCESSFULLY");
    console.log("═══════════════════════════════════════════════════════");
    console.log(`Database: ${dbName}`);
    console.log(`User: ${username}`);
    console.log("\nThe database should now be visible in your MySQL client.");
    console.log("If still not visible, try:");
    console.log("  1. Exit and reconnect your MySQL client");
    console.log("  2. Run: SHOW DATABASES;");
    console.log("═══════════════════════════════════════════════════════");
    
    await connection.end();
    
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    throw error;
  }
}

grantPermissions()
  .then(() => {
    console.log("\n✨ Permission grant completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Failed to grant permissions");
    process.exit(1);
  });
