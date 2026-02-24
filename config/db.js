import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// Simple connection configuration
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 20, // Increased for large imports
  queueLimit: 0, // No limit on queued connections
  timezone: "Z",
  // Enable multi-statement and increase packet size for bulk imports
  multipleStatements: false, // Keep false for security
  connectTimeout: 60000, // 60 seconds
  acquireTimeout: 60000, // 60 seconds
  timeout: 60000, // 60 seconds
});

export default pool;
