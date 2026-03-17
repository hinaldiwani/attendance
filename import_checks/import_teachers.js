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
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const record = {};
        headers.forEach((header, i) => {
            record[header] = values[i] || '';
        });
        return record;
    });
}

async function importTeachers() {
    const connection = await pool.getConnection();

    try {
        console.log('👨‍🏫 Importing teachers...\n');

        const csvPath = path.join(__dirname, '..', 'IMPORT DETAILS', 'teachers.csv');
        const csvContent = fs.readFileSync(csvPath, 'utf-8');

        // Parse CSV
        const records = parseCSV(csvContent);
        console.log(`📝 Parsed ${records.length} records from CSV\n`);

        // Start transaction
        await connection.beginTransaction();

        console.log('🗑️  Clearing existing teachers...');
        await connection.query('DELETE FROM teacher_details_db');
        console.log('✅ Existing teachers cleared\n');

        let successCount = 0;
        let validationSkipCount = 0;

        // Insert each teacher record
        for (const record of records) {
            try {
                if (!isLettersOnlyName(record.Teacher_Name)) {
                    validationSkipCount++;
                    console.log(`  ⚠️  Skipped ${record.Teacher_ID}: invalid teacher name (letters and spaces only)`);
                    continue;
                }

                await connection.query(
                    `INSERT INTO teacher_details_db 
                    (teacher_id, name, subject, stream, year, semester, division) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        record.Teacher_ID,
                        record.Teacher_Name,
                        record.Subject,
                        record.Stream,
                        record.Year,
                        record.Semester,
                        record.Division
                    ]
                );
                successCount++;
                if (successCount <= 3) {
                    console.log(`  ✓ Imported: ${record.Teacher_Name} - ${record.Subject} (${record.Stream} ${record.Year})`);
                }
            } catch (error) {
                console.error(`  ✗ Error importing ${record.Teacher_Name}:`, error.message);
            }
        }

        // Commit transaction
        await connection.commit();
        console.log('\n✅ Transaction committed');

        // Verify import
        const [result] = await connection.query('SELECT COUNT(*) as count FROM teacher_details_db');

        console.log('\n═══════════════════════════════════════════════════════');
        console.log('📊 IMPORT SUMMARY');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`✅ Successfully imported: ${successCount} teacher assignments`);
        console.log(`⚠️  Validation skipped: ${validationSkipCount} teacher assignments`);
        console.log(`✅ Total in database: ${result[0].count}`);
        console.log('═══════════════════════════════════════════════════════\n');

    } catch (error) {
        await connection.rollback();
        console.error('❌ Import failed:', error.message);
        throw error;
    } finally {
        connection.release();
        await pool.end();
    }
}

importTeachers().catch(console.error);
