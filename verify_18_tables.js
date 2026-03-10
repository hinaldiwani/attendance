import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Expected 18 tables in correct order
const EXPECTED_TABLES = [
    'activity_logs',
    'admin_credentials',
    'attendance_backup',
    'attendance_records',
    'attendance_sessions',
    'defaulter_history',
    'defaulter_history_lists',
    'geolocation_logs',
    'manual_overrides',
    'monthly_attendance_summary',
    'self_marking',
    'sessions',
    'student_attendance_stats',
    'student_details_db',
    'teacher_details_db',
    'teacher_student_map',
    'teacher_student_map_backup_migration',
    'teacher_student_mapping'
];

async function verifyTables() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'acadmark_attendance',
        port: process.env.DB_PORT || 3306
    });

    try {
        console.log('🔍 Verifying database tables...\n');

        // Get all tables from database
        const [tables] = await connection.query('SHOW TABLES');
        const actualTables = tables.map(row => Object.values(row)[0]).sort();

        console.log(`Database: ${process.env.DB_NAME || 'acadmark_attendance'}`);
        console.log(`Tables found: ${actualTables.length}/18\n`);

        // Check for missing tables
        const missingTables = EXPECTED_TABLES.filter(t => !actualTables.includes(t));
        const extraTables = actualTables.filter(t => !EXPECTED_TABLES.includes(t));

        if (missingTables.length > 0) {
            console.log('❌ MISSING TABLES:');
            missingTables.forEach(table => console.log(`   - ${table}`));
            console.log();
        }

        if (extraTables.length > 0) {
            console.log('⚠️  EXTRA TABLES (not in expected list):');
            extraTables.forEach(table => console.log(`   - ${table}`));
            console.log();
        }

        if (missingTables.length === 0 && extraTables.length === 0) {
            console.log('✅ All 18 tables are present!\n');
        }

        // Display all tables
        console.log('📋 Complete table list:');
        actualTables.forEach((table, index) => {
            const icon = EXPECTED_TABLES.includes(table) ? '✓' : '?';
            console.log(`   ${icon} ${index + 1}. ${table}`);
        });

        // Verify teacher_details_db schema (semester should be NOT NULL)
        console.log('\n🔍 Checking teacher_details_db schema...');
        const [createTable] = await connection.query(
            "SHOW CREATE TABLE teacher_details_db"
        );
        const createStatement = createTable[0]['Create Table'];

        if (createStatement.includes('`semester` varchar(20) NOT NULL')) {
            console.log('✅ semester column is NOT NULL (correct)');
        } else if (createStatement.includes('`semester` varchar(20) DEFAULT NULL')) {
            console.log('❌ semester column is DEFAULT NULL (needs fix)');
            console.log('\nTo fix, run:');
            console.log('ALTER TABLE teacher_details_db MODIFY semester VARCHAR(20) NOT NULL;');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    } finally {
        await connection.end();
    }
}

verifyTables()
    .then(() => {
        console.log('\n✓ Verification complete');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n✗ Verification failed:', error.message);
        process.exit(1);
    });
