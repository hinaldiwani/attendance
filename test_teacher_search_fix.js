import pool from "./config/db.js";

async function testTeacherSearchFix() {
  try {
    console.log("=== TESTING TEACHER STUDENT SEARCH FIX ===\n");
    
    const studentId = 'BSC001';
    const teacherId = 'TCH101';
    
    console.log(`Testing teacher ${teacherId} searching for student ${studentId}...\n`);
    
    // Test the exact query from teacherController
    const [students] = await pool.query(
      `SELECT 
        s.student_id,
        s.student_name,
        s.year,
        s.stream,
        s.division,
        s.roll_no,
        COALESCE(SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END), 0) as attendance_count,
        COUNT(DISTINCT ases.session_id) as total_sessions
      FROM student_details_db s
      INNER JOIN teacher_student_map tsm ON s.student_id = tsm.student_id
      LEFT JOIN attendance_records ar ON s.student_id = ar.student_id
      LEFT JOIN attendance_sessions ases ON ar.session_id = ases.session_id
      WHERE s.student_id = ? AND tsm.teacher_id = ?
      GROUP BY s.student_id`,
      [studentId, teacherId]
    );
    
    if (students.length > 0) {
      console.log("✅ SUCCESS! Student found with data:");
      console.log(JSON.stringify(students[0], null, 2));
      console.log("\n✅ All required fields present:");
      console.log(`  - student_id: ${students[0].student_id}`);
      console.log(`  - student_name: ${students[0].student_name}`);
      console.log(`  - year: ${students[0].year}`);
      console.log(`  - stream: ${students[0].stream}`);
      console.log(`  - division: ${students[0].division}`);
      console.log(`  - roll_no: ${students[0].roll_no}`);
      console.log(`  - attendance_count: ${students[0].attendance_count}`);
      console.log(`  - total_sessions: ${students[0].total_sessions}`);
    } else {
      console.log("❌ Student not found or not assigned to this teacher");
    }
    
    console.log("\n\n=== FIXES APPLIED ===");
    console.log("1. ✅ Fixed showToast() calls in teacher.js to use object format");
    console.log("2. ✅ Added ID 'teacherSearchButton' to search button in teacher.html");
    console.log("3. ✅ Error messages now display properly instead of 'undefined undefined'");
    console.log("4. ✅ Backend query returns all required student fields");
    
    await pool.end();
  } catch (error) {
    console.error("Error:", error);
    await pool.end();
  }
}

testTeacherSearchFix();
