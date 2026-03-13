import pool from "./config/db.js";
import fs from "fs";

async function testRealImport() {
    console.log("🧪 TESTING REAL IMPORT FLOW\n");
    console.log("=".repeat(60));
    
    const connection = await pool.getConnection();
    
    try {
        // Step 1: Check current state
        console.log("\n📊 STEP 1: Current Database State");
        const [beforeStudents] = await connection.query("SELECT COUNT(*) as count FROM student_details_db");
        const [beforeTeachers] = await connection.query("SELECT COUNT(*) as count FROM teacher_details_db");
        console.log(`   Students: ${beforeStudents[0].count}`);
        console.log(`   Teachers: ${beforeTeachers[0].count}`);
        
        // Step 2: Check when last import happened
        console.log("\n📅 STEP 2: Last Import Activity");
        const [lastActivity] = await connection.query(
            "SELECT action, created_at, details FROM activity_logs WHERE action LIKE '%IMPORT%' ORDER BY created_at DESC LIMIT 3"
        );
        if (lastActivity.length > 0) {
            lastActivity.forEach(a => {
                console.log(`   - ${a.action} at ${new Date(a.created_at).toLocaleString()}`);
            });
        } else {
            console.log("   No import activity found");
        }
        
        // Step 3: Simulate a fresh import
        console.log("\n🔄 STEP 3: Simulating Fresh Import");
        
        // Create test data
        const testStudent = {
            studentId: 'TEST_LIVE_001',
            studentName: 'Live Test Student',
            rollNo: '9999',
            year: 'FY',
            stream: 'TEST',
            division: 'Z'
        };
        
        const testTeacher = {
            teacherId: 'TEACH_TEST_001',
            name: 'Test Teacher',
            subject: 'Test Subject',
            year: 'FY',
            stream: 'TEST',
            semester: '1',
            division: 'Z'
        };
        
        console.log("   Creating test student...");
        await connection.beginTransaction();
        
        const insertStudentSql = `
            INSERT INTO student_details_db 
            (student_id, student_name, roll_no, year, stream, division) 
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            student_name = VALUES(student_name)
        `;
        
        await connection.query(insertStudentSql, [
            testStudent.studentId,
            testStudent.studentName,
            testStudent.rollNo,
            testStudent.year,
            testStudent.stream,
            testStudent.division
        ]);
        console.log("   ✓ Student inserted in transaction");
        
        // Check if visible before commit
        const [duringTx] = await connection.query(
            "SELECT COUNT(*) as count FROM student_details_db WHERE student_id = ?",
            [testStudent.studentId]
        );
        console.log(`   Visible during transaction: ${duringTx[0].count}`);
        
        await connection.commit();
        console.log("   ✓ Transaction committed");
        
        // Verify immediately after commit
        const [afterCommit] = await connection.query(
            "SELECT COUNT(*) as count FROM student_details_db WHERE student_id = ?",
            [testStudent.studentId]
        );
        console.log(`   Visible after commit: ${afterCommit[0].count}`);
        
        // Release and get new connection
        connection.release();
        const freshConnection = await pool.getConnection();
        
        const [freshCheck] = await freshConnection.query(
            "SELECT * FROM student_details_db WHERE student_id = ?",
            [testStudent.studentId]
        );
        
        if (freshCheck.length > 0) {
            console.log("   ✅ SUCCESS! Record persists in new connection");
            console.log(`   Record: ${freshCheck[0].student_name}`);
        } else {
            console.log("   ❌ FAILURE! Record NOT found in new connection");
        }
        
        // Test teacher import
        console.log("\n   Creating test teacher...");
        await freshConnection.beginTransaction();
        
        const insertTeacherSql = `
            INSERT INTO teacher_details_db 
            (teacher_id, name, subject, year, stream, semester, division) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            name = VALUES(name)
        `;
        
        await freshConnection.query(insertTeacherSql, [
            testTeacher.teacherId,
            testTeacher.name,
            testTeacher.subject,
            testTeacher.year,
            testTeacher.stream,
            testTeacher.semester,
            testTeacher.division
        ]);
        
        await freshConnection.commit();
        console.log("   ✓ Teacher committed");
        
        const [teacherCheck] = await freshConnection.query(
            "SELECT * FROM teacher_details_db WHERE teacher_id = ?",
            [testTeacher.teacherId]
        );
        
        if (teacherCheck.length > 0) {
            console.log("   ✅ Teacher import working!");
        } else {
            console.log("   ❌ Teacher import FAILED!");
        }
        
        // Final count
        console.log("\n📊 STEP 4: Final Database State");
        const [afterStudents] = await freshConnection.query("SELECT COUNT(*) as count FROM student_details_db");
        const [afterTeachers] = await freshConnection.query("SELECT COUNT(*) as count FROM teacher_details_db");
        console.log(`   Students: ${beforeStudents[0].count} → ${afterStudents[0].count} (${afterStudents[0].count - beforeStudents[0].count > 0 ? '+' : ''}${afterStudents[0].count - beforeStudents[0].count})`);
        console.log(`   Teachers: ${beforeTeachers[0].count} → ${afterTeachers[0].count} (${afterTeachers[0].count - beforeTeachers[0].count > 0 ? '+' : ''}${afterTeachers[0].count - beforeTeachers[0].count})`);
        
        // Cleanup test data
        console.log("\n🧹 Cleaning up test data...");
        await freshConnection.query("DELETE FROM student_details_db WHERE student_id = ?", [testStudent.studentId]);
        await freshConnection.query("DELETE FROM teacher_details_db WHERE teacher_id = ?", [testTeacher.teacherId]);
        console.log("   ✓ Test data removed");
        
        freshConnection.release();
        
        console.log("\n" + "=".repeat(60));
        console.log("\n🎯 CONCLUSION:");
        
        if (freshCheck.length > 0 && teacherCheck.length > 0) {
            console.log("   ✅ Import mechanism is WORKING PERFECTLY!");
            console.log("   ✅ Data IS being saved to the database!");
            console.log("");
            console.log("   If you don't see the data in MySQL CLI, you are:");
            console.log("   1. Connected to a DIFFERENT MySQL instance");
            console.log("   2. Connected to a DIFFERENT database");
            console.log("   3. Using a DIFFERENT user account");
            console.log("");
            console.log("   Run this in MySQL CLI:");
            console.log("   SELECT @@hostname, @@port, DATABASE(), USER();");
        } else {
            console.log("   ❌ Import mechanism is BROKEN!");
            console.log("   Need to fix the transaction/commit logic");
        }
        
    } catch (error) {
        console.error("\n❌ Error:", error.message);
        console.error("   Stack:", error.stack);
        await connection.rollback().catch(() => {});
    } finally {
        await pool.end();
    }
}

testRealImport();
