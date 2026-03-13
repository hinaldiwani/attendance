import pool from './config/db.js';

async function updateMappings() {
  console.log('🔗 Updating student-teacher mappings...\n');
  
  const connection = await pool.getConnection();

  try {
    // Clear existing mappings
    await connection.execute('DELETE FROM teacher_student_map');
    console.log('✓ Cleared old mappings');

    // Re-create mappings with updated logic
    const [result] = await connection.execute(`
      INSERT INTO teacher_student_map (teacher_id, subject, year, stream, semester, student_id)
      SELECT DISTINCT t.teacher_id, t.subject, t.year, t.stream, t.semester, s.student_id
      FROM teacher_details_db t
      INNER JOIN student_details_db s 
        ON FIND_IN_SET(s.year, REPLACE(t.year, ' ', '')) > 0
        AND FIND_IN_SET(s.stream, REPLACE(t.stream, ' ', '')) > 0
        AND FIND_IN_SET(s.division, REPLACE(t.division, ' ', '')) > 0
      WHERE (t.status = 'Active' OR t.status IS NULL)
        AND t.division IS NOT NULL 
        AND t.division != ''
    `);

    console.log(`✅ Successfully mapped ${result.affectedRows} student-teacher relationships\n`);
    
    // Show breakdown
    const [breakdown] = await connection.execute(`
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
      WHERE t.status = 'Active' OR t.status IS NULL
      GROUP BY t.teacher_id, t.name, t.subject, t.year, t.stream, t.division
      ORDER BY t.teacher_id, t.subject
    `);

    console.log('📊 Mapping breakdown:');
    breakdown.forEach(row => {
      console.log(`  ${row.teacher_id} (${row.name}) - ${row.subject}: ${row.student_count} students mapped`);
      console.log(`    Year: ${row.year}, Stream: ${row.stream}, Division: ${row.division}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

updateMappings().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
