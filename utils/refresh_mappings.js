import pool from "../config/db.js";

async function updateMappings() {
  try {
    console.log("=== UPDATING STUDENT-TEACHER MAPPINGS ===\n");
    
    // Clear existing mappings
    console.log("Step 1: Clearing old mappings...");
    await pool.query(`DELETE FROM teacher_student_map`);
    console.log("✓ Old mappings cleared\n");
    
    // Auto-map students to teachers based on year, stream, division
    console.log("Step 2: Creating new mappings based on year/stream/division...");
    
    const [result] = await pool.query(`
      INSERT INTO teacher_student_map (teacher_id, subject, year, stream, semester, student_id)
      SELECT DISTINCT 
        t.teacher_id,
        t.subject,
        t.year,
        t.stream,
        t.semester,
        s.student_id
      FROM student_details_db s
      INNER JOIN teacher_details_db t ON 
        s.year = t.year 
        AND s.stream = t.stream
        AND FIND_IN_SET(s.division, REPLACE(t.division, ' ', '')) > 0
      WHERE s.student_id IS NOT NULL 
        AND t.teacher_id IS NOT NULL
        AND t.subject IS NOT NULL
        AND t.semester IS NOT NULL
    `);
    
    console.log(`✓ Created ${result.affectedRows} new mappings\n`);
    
    // Verify mapping results
    console.log("Step 3: Verifying mappings...\n");
    
    const [stats] = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM student_details_db) as total_students,
        (SELECT COUNT(DISTINCT student_id) FROM teacher_student_map) as mapped_students,
        (SELECT COUNT(DISTINCT teacher_id) FROM teacher_student_map) as teachers_with_students,
        (SELECT COUNT(*) FROM teacher_student_map) as total_mappings
    `);
    
    console.log("Mapping Statistics:");
    console.log(`  Total Students: ${stats[0].total_students}`);
    console.log(`  Mapped Students: ${stats[0].mapped_students}`);
    console.log(`  Coverage: ${((stats[0].mapped_students / stats[0].total_students) * 100).toFixed(2)}%`);
    console.log(`  Teachers with Students: ${stats[0].teachers_with_students}`);
    console.log(`  Total Mappings: ${stats[0].total_mappings}\n`);
    
    // Show sample mappings per teacher
    console.log("Step 4: Sample mappings per teacher...\n");
    const [teacherMappings] = await pool.query(`
      SELECT 
        t.teacher_id,
        t.name,
        t.subject,
        t.year,
        t.stream,
        t.division,
        COUNT(DISTINCT tsm.student_id) as student_count
      FROM teacher_details_db t
      LEFT JOIN teacher_student_map tsm ON t.teacher_id = tsm.teacher_id
      GROUP BY t.teacher_id, t.name, t.subject, t.year, t.stream, t.division
      ORDER BY t.teacher_id, t.subject
    `);
    
    console.log("Teacher Assignments:");
    teacherMappings.forEach(t => {
      console.log(`  ${t.teacher_id} - ${t.name} (${t.subject})`);
      console.log(`    ${t.year} ${t.stream} Div ${t.division}: ${t.student_count} students`);
    });
    
    console.log("\n✅ Mapping update complete!");
    
    await pool.end();
  } catch (error) {
    console.error("Error:", error);
    await pool.end();
  }
}

updateMappings();
