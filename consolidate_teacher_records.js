import pool from './config/db.js';

/**
 * Script to consolidate duplicate teacher records into clubbed records
 * This will combine multiple rows with same teacher_id into one row with comma-separated values
 */

async function consolidateTeacherRecords() {
    const connection = await pool.getConnection();

    try {
        console.log('🔍 Starting teacher record consolidation...');

        await connection.beginTransaction();

        // Get all teachers grouped by teacher_id
        const [teachers] = await connection.query(`
      SELECT teacher_id
      FROM teacher_details_db
      GROUP BY teacher_id
      HAVING COUNT(*) > 1
    `);

        if (teachers.length === 0) {
            console.log('✅ No duplicate records found. All teachers have single records.');
            await connection.commit();
            return;
        }

        console.log(`📊 Found ${teachers.length} teachers with duplicate records`);

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

            console.log(`\n🔄 Consolidating ${teacherId}: ${records.length} records`);

            // Extract unique values for each field
            const subjects = [...new Set(records.map(r => r.subject).filter(Boolean))];
            const years = [...new Set(records.map(r => r.year).filter(Boolean))];
            const streams = [...new Set(records.map(r => r.stream).filter(Boolean))];
            const semesters = [...new Set(records.map(r => r.semester).filter(Boolean))];

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

            console.log('   📝 Clubbed values:');
            console.log(`      - Subjects: ${clubbedRecord.subject}`);
            console.log(`      - Years: ${clubbedRecord.year}`);
            console.log(`      - Streams: ${clubbedRecord.stream}`);
            console.log(`      - Semesters: ${clubbedRecord.semester}`);

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

            // Also update backup table
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

            consolidatedCount++;
            console.log(`   ✅ Consolidated ${records.length} records into 1`);
        }

        await connection.commit();

        console.log(`\n✅ Successfully consolidated ${consolidatedCount} teachers`);
        console.log('🎉 Database cleanup complete!');

    } catch (error) {
        await connection.rollback();
        console.error('❌ Error consolidating records:', error);
        throw error;
    } finally {
        connection.release();
        await pool.end();
    }
}

// Run the consolidation
consolidateTeacherRecords()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });
