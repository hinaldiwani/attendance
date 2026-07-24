import pool from '../config/db.js';
import { parseStudentImport } from '../src/services/adminService.js';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LETTERS_WITH_SPACES = /^[A-Za-z ]+$/;

function isLettersOnlyName(value) {
    const name = String(value || '').trim();
    return Boolean(name) && LETTERS_WITH_SPACES.test(name);
}

async function importStudents() {
    try {
        console.log('📚 Importing students from CSV...\n');

        const csvPath = path.join(__dirname, 'IMPORT DETAILS', 'students.csv');
        console.log(`Reading from: ${csvPath}\n`);

        // Parse the CSV file
        const students = parseStudentImport(csvPath);
        console.log(`✅ Parsed ${students.length} students from CSV\n`);

        // Clear existing students
        console.log('🗑️  Clearing existing students...');
        await pool.query('DELETE FROM student_details_db');
        console.log('✅ Existing students cleared\n');

        let successCount = 0;
        let errorCount = 0;
        let validationSkipCount = 0;

        // Import each student
        for (const student of students) {
            try {
                if (!isLettersOnlyName(student.studentName)) {
                    validationSkipCount++;
                    console.log(`⚠️  Skipped ${student.studentId}: invalid student name (letters and spaces only)`);
                    continue;
                }

                await pool.query(
                    `INSERT INTO student_details_db 
           (student_id, student_name, roll_no, year, stream, division) 
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
           student_name = VALUES(student_name),
           roll_no = VALUES(roll_no),
           year = VALUES(year),
           stream = VALUES(stream),
           division = VALUES(division)`,
                    [
                        student.studentId,
                        student.studentName,
                        student.rollNo,
                        student.year,
                        student.stream,
                        student.division
                    ]
                );
                successCount++;

                if (successCount % 50 === 0) {
                    console.log(`✓ Imported ${successCount} students...`);
                }
            } catch (err) {
                errorCount++;
                console.log(`⚠️  Error importing ${student.studentId}: ${err.message}`);
            }
        }

        console.log('\n═══════════════════════════════════════════════════════');
        console.log('📊 IMPORT SUMMARY');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`✅ Successfully imported: ${successCount} students`);
        console.log(`⚠️  Validation skipped: ${validationSkipCount} students`);
        console.log(`❌ Errors: ${errorCount}`);
        console.log('═══════════════════════════════════════════════════════\n');

        // Verify import
        const [counts] = await pool.query(`
      SELECT stream, year, division, COUNT(*) as count
      FROM student_details_db
      GROUP BY stream, year, division
      ORDER BY stream, year, division
    `);

        console.log('📊 Students by Stream/Year/Division:');
        counts.forEach(row => {
            console.log(`   ${row.stream} ${row.year} Div ${row.division}: ${row.count} students`);
        });

        console.log('\n🎉 Student import completed successfully!');

    } catch (error) {
        console.error('❌ Error importing students:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

importStudents().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

