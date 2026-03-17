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

    const records = [];
    for (let i = 1; i < lines.length; i++) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let char of lines[i]) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());

        if (values.length === headers.length) {
            const record = {};
            headers.forEach((header, index) => {
                record[header] = values[index].replace(/"/g, '');
            });
            records.push(record);
        }
    }
    return records;
}

async function cleanupAndReimport() {
    try {
        console.log('=== Cleaning up and Re-importing Teachers ===\n');

        // Step 1: Delete BSCDS teacher records
        console.log('Step 1: Removing BSCDS teacher records...');
        const [deleteResult] = await pool.query(`
            DELETE FROM teacher_details_db WHERE stream = 'BSCDS'
        `);
        console.log(`✅ Deleted ${deleteResult.affectedRows} BSCDS teacher records\n`);

        // Step 2: Delete existing BSCIT teacher records to avoid duplicates
        console.log('Step 2: Clearing existing BSCIT teacher records...');
        const [clearResult] = await pool.query(`
            DELETE FROM teacher_details_db WHERE stream = 'BSCIT'
        `);
        console.log(`✅ Cleared ${clearResult.affectedRows} BSCIT teacher records\n`);

        // Step 3: Read and parse the updated teachers.csv
        console.log('Step 3: Reading updated teachers.csv...');
        const csvPath = path.join(__dirname, '..', 'IMPORT DETAILS', 'teachers.csv');
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const records = parseCSV(csvContent);
        console.log(`✅ Found ${records.length} teacher records to import\n`);

        // Step 4: Import teachers
        console.log('Step 4: Importing teachers...');
        let imported = 0;
        let validationSkipCount = 0;
        for (const record of records) {
            if (!isLettersOnlyName(record.Teacher_Name)) {
                validationSkipCount++;
                console.log(`⚠️  Skipped ${record.Teacher_ID}: invalid teacher name (letters and spaces only)`);
                continue;
            }

            await pool.query(
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
            imported++;
        }
        console.log(`✅ Imported ${imported} teacher records\n`);
        console.log(`⚠️  Validation skipped: ${validationSkipCount} teacher records\n`);

        // Step 5: Clear and rebuild mappings
        console.log('Step 5: Rebuilding student-teacher mappings...');
        await pool.query('DELETE FROM teacher_student_map');

        const [mapResult] = await pool.query(`
            INSERT INTO teacher_student_map (teacher_id, student_id)
            SELECT DISTINCT t.teacher_id, s.student_id
            FROM teacher_details_db t
            INNER JOIN student_details_db s 
              ON t.year = s.year 
              AND t.stream = s.stream
              AND FIND_IN_SET(s.division, t.division) > 0
            ON DUPLICATE KEY UPDATE teacher_id = VALUES(teacher_id)
        `);
        console.log(`✅ Created ${mapResult.affectedRows} mappings\n`);

        // Step 6: Verify results
        console.log('Step 6: Verifying results...');

        const [streamCheck] = await pool.query(`
            SELECT DISTINCT stream FROM teacher_details_db ORDER BY stream
        `);
        console.log('Streams in teacher_details_db:');
        streamCheck.forEach(s => console.log(`  - ${s.stream}`));

        const [mappingCheck] = await pool.query(`
            SELECT s.stream, COUNT(DISTINCT m.student_id) as mapped_students
            FROM teacher_student_map m
            INNER JOIN student_details_db s ON m.student_id = s.student_id
            GROUP BY s.stream
        `);
        console.log('\nMapped Students:');
        mappingCheck.forEach(m =>
            console.log(`  ${m.stream}: ${m.mapped_students} students`)
        );

        const [unmappedCheck] = await pool.query(`
            SELECT COUNT(*) as count
            FROM student_details_db s
            LEFT JOIN teacher_student_map m ON s.student_id = m.student_id
            WHERE m.student_id IS NULL
        `);
        console.log(`\nUnmapped students: ${unmappedCheck[0].count}`);

        console.log('\n✅ Cleanup and re-import completed successfully!');

        await pool.end();
    } catch (error) {
        console.error('Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

cleanupAndReimport();
