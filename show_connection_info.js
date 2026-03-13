import pool from "./config/db.js";

async function showConnectionDetails() {
    console.log("🔍 YOUR APPLICATION CONNECTS TO:\n");
    console.log("=".repeat(60));
    
    const connection = await pool.getConnection();
    
    try {
        const [host] = await connection.query("SELECT @@hostname as host, @@port as port");
        const [db] = await connection.query("SELECT DATABASE() as db");
        const [user] = await connection.query("SELECT USER() as user");
        const [socket] = await connection.query("SELECT @@socket as socket");
        
        console.log("📍 CONNECTION DETAILS:");
        console.log(`   Host: ${host[0].host}`);
        console.log(`   Port: ${host[0].port}`);
        console.log(`   Database: ${db[0].db}`);
        console.log(`   User: ${user[0].user}`);
        console.log(`   Socket: ${socket[0].socket || 'TCP/IP'}`);
        
        console.log("\n📊 ACTUAL DATA IN THIS DATABASE:");
        const [students] = await connection.query("SELECT COUNT(*) as count FROM student_details_db");
        const [teachers] = await connection.query("SELECT COUNT(*) as count FROM teacher_details_db");
        
        console.log(`   Students: ${students[0].count}`);
        console.log(`   Teachers: ${teachers[0].count}`);
        
        if (students[0].count > 0) {
            console.log("\n📋 SAMPLE STUDENT RECORDS:");
            const [sample] = await connection.query(
                "SELECT student_id, student_name, year, stream, division FROM student_details_db LIMIT 5"
            );
            sample.forEach(s => {
                console.log(`   - ${s.student_id}: ${s.student_name} (${s.year} ${s.stream} ${s.division})`);
            });
        }
        
        console.log("\n" + "=".repeat(60));
        console.log("\n⚠️  IN YOUR MYSQL CLI, RUN THESE COMMANDS:\n");
        console.log("   SHOW DATABASES;");
        console.log("   -- Look for: acadmark_attendance");
        console.log("");
        console.log("   SELECT @@hostname, @@port;");
        console.log(`   -- Should match: ${host[0].host}:${host[0].port}`);
        console.log("");
        console.log("   SELECT USER();");
        console.log(`   -- Should be: ${user[0].user.split('@')[0]}@localhost`);
        console.log("");
        console.log("   USE acadmark_attendance;");
        console.log("   SELECT COUNT(*) FROM student_details_db;");
        console.log(`   -- Should show: ${students[0].count}`);
        console.log("\n" + "=".repeat(60));
        
    } finally {
        connection.release();
        await pool.end();
    }
}

showConnectionDetails();
