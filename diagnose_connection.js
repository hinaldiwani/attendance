import pool from "./config/db.js";
import mysql from "mysql2/promise";

async function diagnoseConnection() {
    console.log("🔍 DIAGNOSING DATABASE CONNECTION ISSUE\n");
    console.log("=".repeat(60));
    
    let poolConnection;
    let directConnection;
    
    try {
        // Test 1: Check what database the pool connects to
        console.log("\n📋 TEST 1: Pool Connection Details");
        poolConnection = await pool.getConnection();
        
        const [poolDb] = await poolConnection.query("SELECT DATABASE() as db");
        console.log(`   Pool connects to: ${poolDb[0].db}`);
        
        const [poolHost] = await poolConnection.query("SELECT @@hostname as host");
        console.log(`   Host: ${poolHost[0].host}`);
        
        const [poolUser] = await poolConnection.query("SELECT USER() as user");
        console.log(`   User: ${poolUser[0].user}`);
        
        // Test 2: Check autocommit status
        console.log("\n📋 TEST 2: Transaction Settings");
        const [autocommit] = await poolConnection.query("SELECT @@autocommit as ac");
        console.log(`   Autocommit: ${autocommit[0].ac === 1 ? 'ENABLED ✅' : 'DISABLED ❌'}`);
        
        const [isolation] = await poolConnection.query("SELECT @@tx_isolation as iso");
        console.log(`   Isolation Level: ${isolation[0].iso}`);
        
        // Test 3: Try to insert and check if it persists
        console.log("\n📋 TEST 3: Testing Insert & Commit");
        
        // First, check current count
        const [beforeCount] = await poolConnection.query(
            "SELECT COUNT(*) as count FROM student_details_db"
        );
        console.log(`   Current student count: ${beforeCount[0].count}`);
        
        // Insert a test record with explicit transaction
        await poolConnection.query("START TRANSACTION");
        console.log("   ✓ Transaction started");
        
        await poolConnection.query(
            "INSERT INTO student_details_db (student_id, student_name, roll_no, year, stream, division) VALUES (?, ?, ?, ?, ?, ?)",
            ['TEST_DIAG_001', 'Diagnostic Test Student', '999', 'FY', 'TEST', 'A']
        );
        console.log("   ✓ Test record inserted");
        
        const [duringCount] = await poolConnection.query(
            "SELECT COUNT(*) as count FROM student_details_db"
        );
        console.log(`   Count during transaction: ${duringCount[0].count}`);
        
        await poolConnection.query("COMMIT");
        console.log("   ✓ Transaction committed");
        
        const [afterCount] = await poolConnection.query(
            "SELECT COUNT(*) as count FROM student_details_db"
        );
        console.log(`   Count after commit: ${afterCount[0].count}`);
        
        // Release and get new connection to verify persistence
        poolConnection.release();
        poolConnection = await pool.getConnection();
        
        const [newConnectionCount] = await poolConnection.query(
            "SELECT COUNT(*) as count FROM student_details_db WHERE student_id = 'TEST_DIAG_001'"
        );
        console.log(`   Test record in new connection: ${newConnectionCount[0].count}`);
        
        if (newConnectionCount[0].count > 0) {
            console.log("   ✅ Data persists correctly!");
            // Clean up test record
            await poolConnection.query("DELETE FROM student_details_db WHERE student_id = 'TEST_DIAG_001'");
            console.log("   ✓ Test record cleaned up");
        } else {
            console.log("   ❌ Data NOT persisting - COMMIT is not working!");
        }
        
        // Test 4: Check if there are other databases with similar names
        console.log("\n📋 TEST 4: Checking for Similar Databases");
        const [databases] = await poolConnection.query(
            "SHOW DATABASES LIKE '%acadmark%'"
        );
        console.log("   Databases matching 'acadmark':");
        databases.forEach(db => {
            const dbName = db[Object.keys(db)[0]];
            console.log(`   - ${dbName}`);
        });
        
        // Test 5: Direct connection with same credentials
        console.log("\n📋 TEST 5: Testing Direct Connection");
        directConnection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        
        const [directDb] = await directConnection.query("SELECT DATABASE() as db");
        console.log(`   Direct connection database: ${directDb[0].db}`);
        
        const [directCount] = await directConnection.query(
            "SELECT COUNT(*) as count FROM student_details_db"
        );
        console.log(`   Student count via direct connection: ${directCount[0].count}`);
        
        console.log("\n" + "=".repeat(60));
        console.log("\n🎯 DIAGNOSIS SUMMARY:");
        console.log(`   Database: ${poolDb[0].db}`);
        console.log(`   Autocommit: ${autocommit[0].ac === 1 ? 'ENABLED' : 'DISABLED'}`);
        console.log(`   Data Persistence: ${newConnectionCount[0].count > 0 ? 'WORKING ✅' : 'BROKEN ❌'}`);
        
        if (autocommit[0].ac === 0) {
            console.log("\n⚠️  CRITICAL ISSUE FOUND:");
            console.log("   Autocommit is DISABLED!");
            console.log("   This means transactions need explicit COMMIT.");
            console.log("   Your application IS committing, but something is wrong.");
        }
        
    } catch (error) {
        console.error("\n❌ Error during diagnosis:", error.message);
        console.error("   Stack:", error.stack);
    } finally {
        if (poolConnection) poolConnection.release();
        if (directConnection) await directConnection.end();
        await pool.end();
    }
}

diagnoseConnection();
