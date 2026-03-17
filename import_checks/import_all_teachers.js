import pool from '../config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LETTERS_WITH_SPACES = /^[A-Za-z ]+$/;

function isLettersOnlyName(value) {
    const name = String(value || '').trim();
    return Boolean(name) && LETTERS_WITH_SPACES.test(name);
}

function parseCSV(csvContent) {
    const lines = csvContent.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

    return lines.slice(1).map(line => {
        const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g).map(v => v.trim().replace(/^"|"$/g, ''));
        const record = {};
        headers.forEach((header, i) => {
            record[header] = values[i] || '';
        });
        return record;
    });
}

async function importAllTeachers() {
    try {
        console.log('👨‍🏫 Importing all teachers from CSV...\n');

        const csvPath = path.join(__dirname, 'IMPORT DETAILS', 'teachers.csv');
        const csvContent = fs.readFileSync(csvPath, 'utf-8');

        // Parse CSV
        const records = parseCSV(csvContent);
        console.log(`✅ Parsed ${records.length} teacher assignments from CSV\n`);

        // Clear existing teachers
        console.log('🗑️  Clearing existing teachers...');
        await pool.query('DELETE FROM teacher_details_db');
        console.log('✅ Existing teachers cleared\n');

        let successCount = 0;
        let errorCount = 0;
        let validationSkipCount = 0;

        // Import each teacher assignment
        for (const record of records) {
            try {
                if (!isLettersOnlyName(record.Teacher_Name)) {
                    validationSkipCount++;
                    console.log(`⚠️  Skipped ${record.Teacher_ID}: invalid teacher name (letters and spaces only)`);
                    continue;
                }

                await pool.query(
                    `INSERT INTO teacher_details_db 
           (teacher_id, name, subject, year, stream, semester, division) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        record.Teacher_ID,
                        record.Teacher_Name,
                        record.Subject,
                        record.Year,
                        record.Stream,
                        record.Semester,
                        record.Division
                    ]
                );
                successCount++;
                console.log(`✓ Imported: ${record.Teacher_Name} - ${record.Subject} (${record.Year} ${record.Stream})`);
            } catch (err) {
                errorCount++;
                console.log(`⚠️  Error importing ${record.Teacher_ID} - ${record.Subject}: ${err.message}`);
            }
        }

        console.log('\n═══════════════════════════════════════════════════════');
        console.log('📊 IMPORT SUMMARY');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`✅ Successfully imported: ${successCount} teacher assignments`);
        console.log(`⚠️  Validation skipped: ${validationSkipCount} teacher assignments`);
        console.log(`❌ Errors: ${errorCount}`);
        console.log('═══════════════════════════════════════════════════════\n');

        // Verify import
        const [teachers] = await pool.query(`
      SELECT teacher_id, name, subject, year, stream, semester, division
      FROM teacher_details_db
      ORDER BY teacher_id, year, stream
    `);

        console.log('📊 Imported Teacher Assignments:\n');
        teachers.forEach(t => {
            console.log(`   ${t.teacher_id} - ${t.name}`);
            console.log(`   └─ ${t.subject} (${t.year} ${t.stream} ${t.semester} Div ${t.division})\n`);
        });

        const [uniqueTeachers] = await pool.query('SELECT COUNT(DISTINCT teacher_id) as count FROM teacher_details_db');
        console.log(`✅ Total unique teachers: ${uniqueTeachers[0].count}`);
        console.log(`✅ Total teacher assignments: ${teachers.length}`);
        console.log('\n🎉 Teacher import completed successfully!');

    } catch (error) {
        console.error('❌ Error importing teachers:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

importAllTeachers().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
