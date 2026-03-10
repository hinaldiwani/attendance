import pool from "./config/db.js";

/**
 * Consolidate duplicate teacher records into single clubbed records
 */
async function consolidateDuplicates() {
  const connection = await pool.getConnection();

  try {
    console.log('🔍 Starting consolidation for duplicate teacher records...\n');

    await connection.beginTransaction();

    // Get all teachers with multiple records
    const [teachers] = await connection.query(`
      SELECT teacher_id, COUNT(*) as count
      FROM teacher_details_db
      GROUP BY teacher_id
      HAVING COUNT(*) > 1
    `);

    console.log(`📊 Found ${teachers.length} teachers with duplicate records:\n`);

    teachers.forEach(t => {
      console.log(`   - ${t.teacher_id}: ${t.count} records`);
    });
    console.log('');

    if (teachers.length === 0) {
      await connection.commit();
      console.log('✅ No duplicates found. All teachers already have single clubbed records.');
      process.exit(0);
    }

    let consolidatedCount = 0;

    for (const teacher of teachers) {
      const teacherId = teacher.teacher_id;

      // Get all records for this teacher
      const [records] = await connection.query(`
        SELECT * FROM teacher_details_db
        WHERE teacher_id = ?
        ORDER BY subject, year, stream, semester
      `, [teacherId]);

      if (records.length <= 1) continue;

      console.log(`\n🔄 Processing ${teacherId} (${records[0].name})...`);
      console.log(`   ${records.length} records found`);

      // Extract unique values for each field
      const subjects = [...new Set(records.map(r => r.subject).filter(Boolean))];
      const years = [...new Set(records.map(r => r.year).filter(Boolean))];
      const streams = [...new Set(records.map(r => r.stream).filter(Boolean))];
      const semesters = [...new Set(records.map(r => r.semester).filter(Boolean))];

      console.log(`   Subjects: ${subjects.join(', ')}`);
      console.log(`   Years: ${years.join(', ')}`);
      console.log(`   Streams: ${streams.join(', ')}`);
      console.log(`   Semesters: ${semesters.join(', ')}`);

      // Use first record as base
      const baseRecord = records[0];

      // Create clubbed record
      const clubbedRecord = {
        teacher_id: baseRecord.teacher_id,
        name: baseRecord.name,
        subject: subjects.join(', '),
        year: years.join(', '),
        stream: streams.join(', '),
        semester: semesters.join(', '),
        division: baseRecord.division,
        status: baseRecord.status || 'Active'
      };

      // Delete all existing records for this teacher
      await connection.query(`
        DELETE FROM teacher_details_db WHERE teacher_id = ?
      `, [teacherId]);

      // Insert the new clubbed record
      await connection.query(`
        INSERT INTO teacher_details_db 
        (teacher_id, name, subject, year, stream, semester, division, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        clubbedRecord.teacher_id,
        clubbedRecord.name,
        clubbedRecord.subject,
        clubbedRecord.year,
        clubbedRecord.stream,
        clubbedRecord.semester,
        clubbedRecord.division,
        clubbedRecord.status
      ]);

      // Also update backup table if it exists
      try {
        await connection.query(`
          DELETE FROM teacher_status_backup WHERE teacher_id = ?
        `, [teacherId]);

        await connection.query(`
          INSERT INTO teacher_status_backup 
          (teacher_id, name, subject, year, stream, semester, division, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          clubbedRecord.teacher_id,
          clubbedRecord.name,
          clubbedRecord.subject,
          clubbedRecord.year,
          clubbedRecord.stream,
          clubbedRecord.semester,
          clubbedRecord.division,
          clubbedRecord.status
        ]);
      } catch (backupError) {
        console.log(`   ⚠️  Backup table update skipped (table may not exist)`);
      }

      consolidatedCount++;
      console.log(`   ✅ Consolidated into 1 clubbed record`);
    }

    await connection.commit();

    console.log(`\n🎉 Consolidation complete!`);
    console.log(`   ${consolidatedCount} teachers consolidated`);
    console.log(`   Each teacher now has a single record with comma-separated values\n`);

    // Verify consolidation
    const [afterCheck] = await connection.query(`
      SELECT teacher_id, COUNT(*) as count
      FROM teacher_details_db
      GROUP BY teacher_id
      HAVING COUNT(*) > 1
    `);

    if (afterCheck.length === 0) {
      console.log('✅ Verification passed: No duplicate records remain\n');
    } else {
      console.log('⚠️  Warning: Some duplicates still exist:', afterCheck);
    }

  } catch (error) {
    await connection.rollback();
    console.error('\n❌ Error during consolidation:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

// Run the consolidation
consolidateDuplicates();
