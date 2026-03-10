const mysql = require('mysql2/promise');
require('dotenv').config();

async function createTeacherDetailsTable() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'acadmark_attendance',
        port: process.env.DB_PORT || 3306
    });

    try {
        console.log('Connected to MySQL database');

        // Create teacher_details_db table
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS teacher_details_db (
                teacher_id VARCHAR(50) NOT NULL,
                name VARCHAR(255) NOT NULL,
                subject VARCHAR(100) NOT NULL,
                year VARCHAR(10) NOT NULL,
                stream VARCHAR(100) NOT NULL,
                semester VARCHAR(20) NOT NULL,
                division VARCHAR(100) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (teacher_id, subject, year, stream, semester),
                UNIQUE KEY ux_teacher_assignment (teacher_id(50), subject(100), year(10), stream(50), semester(10), division(50)),
                INDEX idx_teacher_id_lookup (teacher_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
        `;

        await connection.query(createTableQuery);
        console.log('✓ teacher_details_db table created successfully');

        // Verify the table was created
        const [tables] = await connection.query(
            "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = ? AND table_name = 'teacher_details_db'",
            [process.env.DB_NAME || 'acadmark_attendance']
        );

        if (tables[0].count > 0) {
            console.log('✓ Verified: teacher_details_db table exists');
        }

        // Show all tables
        const [allTables] = await connection.query('SHOW TABLES');
        console.log(`\nTotal tables in database: ${allTables.length}`);
        console.log('\nAll tables:');
        allTables.forEach((table, index) => {
            const tableName = Object.values(table)[0];
            console.log(`${index + 1}. ${tableName}`);
        });

    } catch (error) {
        console.error('Error creating table:', error.message);
        throw error;
    } finally {
        await connection.end();
        console.log('\nConnection closed');
    }
}

createTeacherDetailsTable()
    .then(() => {
        console.log('\n✓ Process completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n✗ Process failed:', error.message);
        process.exit(1);
    });
