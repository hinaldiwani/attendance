import pool from './config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseCSV(csvContent) {
    const lines = csvContent.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

    return lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const record = {};
        headers.forEach((header, i) => {
            record[header] = values[i] || '';
        });
        return record;
    });
}

async function importStudentsWithUniqueIds() {
    const connection = await pool.getConnection();

    try {
        console.log('📚 Importing students with unique IDs...\n');

        const csvPath = path.join(__dirname, 'IMPORT DETAILS', 'students.csv.csv');
        const csvContent = fs.readFileSync(csvPath, 'utf-8');

        // Parse CSV
        const records = parseCSV(csvContent);
        console.log(`📝 Parsed ${records.length} records from CSV\n`);

        // Start transaction
        await connection.beginTransaction();

        console.log('🗑️  Clearing existing students...');
        await connection.query('DELETE FROM student_details_db');
        console.log('✅ Existing students cleared\n');

        let successCount = 0;
        let errorCount = 0;

        // Prepare batch insert
        const batchSize = 50;
        const values = [];
        const placeholders = [];

        for (let i = 0; i < records.length; i++) {
            const record = records[i];

            // Generate unique student ID: StreamCode + original ID
            const uniqueId = `${record.Student_ID}_${record.Stream}`;

            // Debug first few
            if (i < 5) {
                console.log(`  DEBUG: Will insert ID="${uniqueId}" Name="${record.Student_Name}" Stream="${record.Stream}"`);
            }

            values.push(
                uniqueId,
                record.Student_Name,
                record.Roll_No,
                record.Year,
                record.Stream,
                record.Division
            );
            placeholders.push('(?, ?, ?, ?, ?, ?)');
            successCount++;

            // Insert in batches or when reaching end
            if (placeholders.length === batchSize || i === records.length - 1) {
                try {
                    const insertQuery = `INSERT INTO student_details_db 
                        (student_id, student_name, roll_no, year, stream, division) 
                        VALUES ${placeholders.join(', ')}`;

                    await connection.query(insertQuery, values);

                    if (successCount % 50 === 0 || i === records.length - 1) {
                        console.log(`✓ Inserted ${successCount} students...`);
                    }

                    // Reset for next batch
                    values.length = 0;
                    placeholders.length = 0;
                } catch (err) {
                    errorCount += placeholders.length;
                    console.log(`⚠️  Error inserting batch: ${err.message}`);
                    // Reset for next batch
                    values.length = 0;
                    placeholders.length = 0;
                }
            }
        }

        // Commit transaction
        await connection.commit();
        console.log('\n✅ Transaction committed\n');

        console.log('═══════════════════════════════════════════════════════');
        console.log('📊 IMPORT SUMMARY');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`✅ Successfully imported: ${successCount} students`);
        console.log(`❌ Errors: ${errorCount}`);
        console.log('═══════════════════════════════════════════════════════\n');

        // Verify import
        const [counts] = await connection.query(`
      SELECT stream, year, division, COUNT(*) as count
      FROM student_details_db
      GROUP BY stream, year, division
      ORDER BY stream, year, division
    `);

        console.log('📊 Students by Stream/Year/Division:');
        counts.forEach(row => {
            console.log(`   ${row.stream} ${row.year} Div ${row.division}: ${row.count} students`);
        });

        const [total] = await connection.query('SELECT COUNT(*) as total FROM student_details_db');
        console.log(`\n✅ Total students in database: ${total[0].total}`);
        console.log('\n🎉 Student import completed successfully!');

    } catch (error) {
        if (connection) {
            await connection.rollback();
            console.log('❌ Transaction rolled back');
        }
        console.error('❌ Error importing students:', error);
        throw error;
    } finally {
        if (connection) {
            connection.release();
        }
        await pool.end();
    }
}

importStudentsWithUniqueIds().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
