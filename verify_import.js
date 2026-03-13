import pool from "./config/db.js";

async function verifyImport() {
    console.log("🔍 Verifying Database Import Status\n");
    console.log("=".repeat(50));
    
    try {
        // Check database connection
        const [dbInfo] = await pool.query("SELECT DATABASE() as db_name");
        console.log(`\n✅ Connected to database: ${dbInfo[0].db_name}`);
        
        // Check student count
        const [students] = await pool.query("SELECT COUNT(*) as count FROM student_details_db");
        console.log(`\n📚 Students in database: ${students[0].count}`);
        
        if (students[0].count > 0) {
            const [sampleStudents] = await pool.query(
                "SELECT student_id, student_name, year, stream, division FROM student_details_db LIMIT 5"
            );
            console.log("\n   Sample students:");
            sampleStudents.forEach(s => {
                console.log(`   - ${s.student_id}: ${s.student_name} (${s.year} ${s.stream} ${s.division})`);
            });
        }
        
        // Check teacher count
        const [teachers] = await pool.query("SELECT COUNT(*) as count FROM teacher_details_db");
        console.log(`\n👨‍🏫 Teachers in database: ${teachers[0].count}`);
        
        if (teachers[0].count > 0) {
            const [sampleTeachers] = await pool.query(
                "SELECT teacher_id, name, subject, year, stream FROM teacher_details_db LIMIT 5"
            );
            console.log("\n   Sample teachers:");
            sampleTeachers.forEach(t => {
                console.log(`   - ${t.teacher_id}: ${t.name} (${t.subject}, ${t.year} ${t.stream})`);
            });
        }
        
        // Check mappings
        const [mappings] = await pool.query("SELECT COUNT(*) as count FROM teacher_student_map");
        console.log(`\n🔗 Student-Teacher mappings: ${mappings[0].count}`);
        
        // Check recent activity
        const [activity] = await pool.query(
            "SELECT action, details, created_at FROM activity_logs ORDER BY created_at DESC LIMIT 5"
        );
        
        if (activity.length > 0) {
            console.log("\n📋 Recent import activity:");
            activity.forEach(a => {
                const timestamp = new Date(a.created_at).toLocaleString();
                console.log(`   - ${timestamp}: ${a.action}`);
                if (a.details) {
                    try {
                        const details = JSON.parse(a.details);
                        console.log(`     Details: ${JSON.stringify(details)}`);
                    } catch (e) {
                        console.log(`     Details: ${a.details}`);
                    }
                }
            });
        }
        
        console.log("\n" + "=".repeat(50));
        console.log("\n📊 Summary:");
        console.log(`   ✓ Database connection: Working`);
        console.log(`   ✓ Students imported: ${students[0].count}`);
        console.log(`   ✓ Teachers imported: ${teachers[0].count}`);
        console.log(`   ✓ Mappings created: ${mappings[0].count}`);
        
        if (students[0].count === 0 && teachers[0].count === 0) {
            console.log("\n⚠️  No data found in database!");
            console.log("   This means either:");
            console.log("   1. No imports have been done yet");
            console.log("   2. Imports are failing silently");
            console.log("   3. Data is being saved to a different database");
        } else {
            console.log("\n✅ Data IS being saved to the database successfully!");
        }
        
        console.log("\n");
        
    } catch (error) {
        console.error("\n❌ Error:", error.message);
        console.error("   Stack:", error.stack);
    } finally {
        await pool.end();
    }
}

verifyImport();
