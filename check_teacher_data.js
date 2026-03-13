import pool from "./config/db.js";

async function checkTeacherData() {
    console.log("🔍 CHECKING TEACHER DATA\n");
    console.log("=".repeat(60));

    const connection = await pool.getConnection();

    try {
        // Check teacher count
        const [count] = await connection.query("SELECT COUNT(*) as count FROM teacher_details_db");
        console.log(`\n📊 Total teacher records: ${count[0].count}`);

        // Check distinct teachers
        const [distinctTeachers] = await connection.query(
            "SELECT COUNT(DISTINCT teacher_id) as count FROM teacher_details_db"
        );
        console.log(`📊 Distinct teachers: ${distinctTeachers[0].count}`);

        // Show all teacher records
        const [teachers] = await connection.query(
            "SELECT teacher_id, name, subject, year, stream, semester, division FROM teacher_details_db"
        );

        if (teachers.length > 0) {
            console.log("\n📋 All teacher records in database:");
            teachers.forEach((t, index) => {
                console.log(`\n${index + 1}. Teacher ID: ${t.teacher_id}`);
                console.log(`   Name: ${t.name}`);
                console.log(`   Subject: ${t.subject}`);
                console.log(`   Year: ${t.year}`);
                console.log(`   Stream: ${t.stream}`);
                console.log(`   Semester: ${t.semester}`);
                console.log(`   Division: ${t.division}`);
            });
        } else {
            console.log("\n⚠️  No teachers found in database!");
            console.log("\nPossible reasons:");
            console.log("1. Teachers haven't been imported yet");
            console.log("2. Import failed silently");
            console.log("3. Teachers were imported to wrong database");
        }

        // Check recent import activity
        console.log("\n" + "=".repeat(60));
        console.log("\n📅 Recent Import Activity:");
        const [activity] = await connection.query(
            "SELECT action, created_at, details FROM activity_logs WHERE action LIKE '%TEACHER%' OR action LIKE '%IMPORT%' ORDER BY created_at DESC LIMIT 5"
        );

        if (activity.length > 0) {
            activity.forEach(a => {
                console.log(`\n- ${a.action} at ${new Date(a.created_at).toLocaleString()}`);
                if (a.details) {
                    try {
                        const details = JSON.parse(a.details);
                        console.log(`  Details: ${JSON.stringify(details)}`);
                    } catch (e) {
                        console.log(`  Details: ${a.details}`);
                    }
                }
            });
        } else {
            console.log("\n  No teacher import activity found");
        }

        console.log("\n" + "=".repeat(60));

    } catch (error) {
        console.error("\n❌ Error:", error.message);
    } finally {
        connection.release();
        await pool.end();
    }
}

checkTeacherData();
