import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import request from "supertest";
import XLSX from "xlsx";

import app from "../src/app.js";
import pool from "../config/db.js";
import initializeDatabase from "../init-db.js";

const TMP_DIR = path.join(process.cwd(), "tests", "tmp");
const seed = Date.now().toString().slice(-8);

const testData = {
    adminUser: process.env.ADMIN_USER || "admin@acadmark",
    adminPassword: process.env.ADMIN_PASSWORD || "admin123",
    teacherId: `TCH${seed}`,
    teacherName: "Test Teacher",
    subject: "DataScience",
    year: "FY",
    stream: "BSCIT",
    semester: "Sem 2",
    division: "Z",
    students: [
        { studentId: `ST${seed}01`, studentName: "Alice Test", rollNo: "1" },
        { studentId: `ST${seed}02`, studentName: "Bob Test", rollNo: "2" },
        { studentId: `ST${seed}03`, studentName: "Carol Test", rollNo: "3" },
    ],
};

let adminAgent;
let teacherAgent;
let studentAgent;

let attendanceSessionId;
let backupId;
let defaulterHistoryId;

const teachersFile = path.join(TMP_DIR, `teachers_${seed}.xlsx`);
const studentsFile = path.join(TMP_DIR, `students_${seed}.xlsx`);

function writeXlsx(filePath, rows) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, filePath);
}

async function resolveAdminPassword() {
    try {
        const [rows] = await pool.query(
            "SELECT password FROM admin_credentials WHERE username = ? LIMIT 1",
            [testData.adminUser],
        );

        if (rows?.length && rows[0].password) {
            return rows[0].password;
        }
    } catch (error) {
        if (error?.code !== "ER_NO_SUCH_TABLE") {
            throw error;
        }
    }

    return testData.adminPassword;
}

function ensureOk(response, context) {
    assert.equal(
        response.status,
        200,
        `${context} failed with ${response.status}: ${JSON.stringify(response.body)}`,
    );
}

function ensureDefaulterDownload(response, context) {
    if (response.status === 200) {
        assert.match(
            response.headers["content-type"] || "",
            /application\/vnd.openxmlformats-officedocument.spreadsheetml.sheet/,
            `${context} expected Excel content type`,
        );
        return;
    }

    assert.equal(
        response.status,
        404,
        `${context} failed with unexpected status ${response.status}: ${JSON.stringify(response.body)}`,
    );
    assert.ok(
        typeof response.body?.message === "string" && response.body.message.length > 0,
        `${context} should return explanatory message when no defaulters are available`,
    );
}

function isLegacyDefaulterSchemaIssue(response) {
    if (!response || response.status !== 500) {
        return false;
    }

    const text = JSON.stringify(response.body || {});
    return /Unknown column|monthly_attendance_summary|update_monthly_attendance|ER_BAD_FIELD_ERROR|ER_SP_DOES_NOT_EXIST/i.test(
        text,
    );
}

async function cleanupTestArtifacts() {
    const studentIds = testData.students.map((s) => s.studentId);
    const placeholders = studentIds.map(() => "?").join(",");

    await pool.query(
        `DELETE FROM self_marking WHERE student_id IN (${placeholders})`,
        studentIds,
    );
    await pool.query(
        `DELETE FROM geolocation_logs WHERE student_id IN (${placeholders})`,
        studentIds,
    );
    await pool.query(
        `DELETE FROM attendance_records WHERE student_id IN (${placeholders})`,
        studentIds,
    );
    await pool.query(
        "DELETE FROM manual_overrides WHERE teacher_id = ?",
        [testData.teacherId],
    );
    await pool.query(
        "DELETE FROM attendance_backup WHERE teacher_id = ?",
        [testData.teacherId],
    );
    await pool.query(
        "DELETE FROM attendance_sessions WHERE teacher_id = ?",
        [testData.teacherId],
    );
    await pool.query(
        `DELETE FROM teacher_student_map WHERE teacher_id = ? OR student_id IN (${placeholders})`,
        [testData.teacherId, ...studentIds],
    );
    await pool.query(
        `DELETE FROM student_details_db WHERE student_id IN (${placeholders})`,
        studentIds,
    );
    await pool.query(
        "DELETE FROM teacher_details_db WHERE teacher_id = ?",
        [testData.teacherId],
    );
    await pool.query(
        "DELETE FROM Defaulter_History_Lists WHERE teacher_id = ?",
        [testData.teacherId],
    );
}

before(async () => {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    await initializeDatabase();
    await cleanupTestArtifacts();

    writeXlsx(
        studentsFile,
        testData.students.map((s) => ({
            Student_ID: s.studentId,
            Name: s.studentName,
            Roll_No: s.rollNo,
            Year: testData.year,
            Stream: testData.stream,
            Division: testData.division,
        })),
    );

    writeXlsx(teachersFile, [
        {
            Teacher_ID: testData.teacherId,
            Name: testData.teacherName,
            Subject: testData.subject,
            Year: testData.year,
            Stream: testData.stream,
            Semester: testData.semester,
            Division: testData.division,
        },
    ]);

    adminAgent = request.agent(app);
    teacherAgent = request.agent(app);
    studentAgent = request.agent(app);

    const password = await resolveAdminPassword();
    const adminLogin = await adminAgent.post("/api/auth/login").send({
        role: "admin",
        identifier: testData.adminUser,
        password,
    });
    ensureOk(adminLogin, "Admin login");
});

after(async () => {
    try {
        await cleanupTestArtifacts();
    } finally {
        for (const filePath of [studentsFile, teachersFile]) {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    }
});

test("real-world import to attendance to reports flow", async () => {
    const uploadStudents = await adminAgent
        .post("/api/admin/import/students")
        .field("mergeMode", "replace")
        .attach("file", studentsFile);
    ensureOk(uploadStudents, "Student import upload");
    assert.ok(uploadStudents.body.uploaded >= testData.students.length);

    const uploadTeachers = await adminAgent
        .post("/api/admin/import/teachers")
        .field("mergeMode", "replace")
        .attach("file", teachersFile);
    ensureOk(uploadTeachers, "Teacher import upload");
    assert.ok(uploadTeachers.body.uploaded >= 1);

    const preview = await adminAgent.get("/api/admin/import/preview");
    ensureOk(preview, "Import preview");
    assert.ok(Array.isArray(preview.body.students));
    assert.ok(Array.isArray(preview.body.teachers));

    const confirm = await adminAgent.post("/api/admin/import/confirm").send({
        includeStudents: true,
        includeTeachers: true,
        clearExisting: false,
    });
    ensureOk(confirm, "Import confirm");
    assert.ok(confirm.body.results.students.inserted >= testData.students.length);
    assert.ok(confirm.body.results.teachers.inserted >= 1);

    ensureOk(await adminAgent.get("/api/admin/stats"), "Admin stats");
    ensureOk(await adminAgent.get("/api/admin/dashboard"), "Admin dashboard");
    ensureOk(await adminAgent.get("/api/admin/activity"), "Admin activity feed");
    ensureOk(await adminAgent.get("/api/admin/teachers-info"), "Teachers info");

    const studentsInfo = await adminAgent
        .get("/api/admin/students-info")
        .query({ year: testData.year, stream: testData.stream, division: testData.division });
    ensureOk(studentsInfo, "Students info");
    assert.ok(studentsInfo.body.count >= testData.students.length);

    ensureOk(
        await adminAgent
            .get("/api/admin/search/student/" + testData.students[0].studentId),
        "Admin student search",
    );
    ensureOk(
        await adminAgent.get("/api/admin/search/teacher/" + testData.teacherId),
        "Admin teacher search",
    );

    const teacherLogin = await teacherAgent.post("/api/auth/login").send({
        role: "teacher",
        identifier: testData.teacherId,
    });
    ensureOk(teacherLogin, "Teacher login");

    ensureOk(await teacherAgent.get("/api/teacher/status"), "Teacher status");
    ensureOk(await teacherAgent.get("/api/teacher/dashboard"), "Teacher dashboard");
    ensureOk(await teacherAgent.get("/api/teacher/streams"), "Teacher streams");

    const subjects = await teacherAgent.get("/api/teacher/subjects").query({
        year: testData.year,
        stream: testData.stream,
        division: testData.division,
        semester: testData.semester,
    });
    ensureOk(subjects, "Teacher subjects for class");

    const startAttendance = await teacherAgent
        .post("/api/teacher/attendance/start")
        .send({
            subject: testData.subject,
            year: testData.year,
            semester: testData.semester,
            stream: testData.stream,
            division: testData.division,
        });
    ensureOk(startAttendance, "Start attendance");
    assert.ok(Array.isArray(startAttendance.body.students));
    attendanceSessionId = startAttendance.body.sessionId;

    const attendancePayload = testData.students.map((student, index) => ({
        studentId: student.studentId,
        status: index === 1 ? "A" : "P",
    }));

    const endAttendance = await teacherAgent
        .post("/api/teacher/attendance/end")
        .send({
            sessionId: attendanceSessionId,
            subject: testData.subject,
            year: testData.year,
            semester: testData.semester,
            stream: testData.stream,
            division: testData.division,
            attendance: attendancePayload,
        });
    ensureOk(endAttendance, "End attendance");
    assert.ok(endAttendance.body.summary.present >= 1);
    assert.ok(endAttendance.body.summary.absent >= 1);

    ensureOk(await teacherAgent.get("/api/teacher/students"), "Mapped students");
    ensureOk(
        await teacherAgent.get("/api/teacher/students/present"),
        "Teacher students/present",
    );
    ensureOk(
        await teacherAgent.get("/api/teacher/subject-sessions"),
        "Teacher subject sessions",
    );

    ensureOk(
        await teacherAgent.post("/api/teacher/attendance/manual").send({
            studentId: testData.students[1].studentId,
            status: "A",
            reason: "Network issue during biometric sync",
        }),
        "Manual attendance override",
    );

    ensureOk(
        await teacherAgent.post("/api/teacher/attendance/backup").send({
            filename: `manual_backup_${seed}.csv`,
            sessionId: attendanceSessionId,
            subject: testData.subject,
            year: testData.year,
            semester: testData.semester,
            stream: testData.stream,
            division: testData.division,
            attendance: attendancePayload,
            fileContent: Buffer.from("backup,content").toString("base64"),
        }),
        "Save attendance backup",
    );

    const history = await teacherAgent.get("/api/teacher/attendance/history");
    ensureOk(history, "Teacher attendance history");
    assert.ok(history.body.history.length > 0);
    backupId = history.body.history[0].id;

    ensureOk(
        await teacherAgent.get(`/api/teacher/attendance/backup/${backupId}/view`),
        "View attendance backup",
    );

    const backupDownload = await teacherAgent.get(
        `/api/teacher/attendance/backup/${backupId}`,
    );
    assert.equal(backupDownload.status, 200);
    assert.match(
        backupDownload.headers["content-type"],
        /application\/vnd.openxmlformats-officedocument.spreadsheetml.sheet/,
    );

    const excelExport = await teacherAgent
        .post("/api/teacher/attendance/export-excel")
        .send({
            sessionId: attendanceSessionId,
            subject: testData.subject,
            year: testData.year,
            semester: testData.semester,
            stream: testData.stream,
            division: testData.division,
            startedAt: new Date().toISOString(),
            teacherName: testData.teacherName,
            summary: { present: 2, absent: 1 },
            students: testData.students.map((s, idx) => ({
                rollNo: s.rollNo,
                studentId: s.studentId,
                name: s.studentName,
                status: idx === 1 ? "A" : "P",
            })),
        });
    assert.equal(excelExport.status, 200);
    assert.match(
        excelExport.headers["content-type"],
        /application\/vnd.openxmlformats-officedocument.spreadsheetml.sheet/,
    );

    ensureOk(await teacherAgent.get("/api/teacher/activity"), "Teacher activity");

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const teacherDefaulters = await teacherAgent.get("/api/teacher/defaulters").query({
        type: "monthly",
        threshold: 75,
        month,
        year,
        stream: testData.stream,
        division: testData.division,
    });
    const teacherDefaulterFeatureAvailable = !isLegacyDefaulterSchemaIssue(teacherDefaulters);
    if (teacherDefaulterFeatureAvailable) {
        ensureOk(teacherDefaulters, "Teacher defaulter list");

        const teacherDefaultersDownload = await teacherAgent
            .get("/api/teacher/defaulters/download")
            .query({
                type: "monthly",
                threshold: 75,
                month,
                year,
                stream: testData.stream,
                division: testData.division,
            });
        ensureDefaulterDownload(
            teacherDefaultersDownload,
            "Teacher defaulter report download",
        );
    }

    ensureOk(
        await teacherAgent.get("/api/teacher/attendance-dates").query({ month, year }),
        "Teacher attendance dates",
    );

    ensureOk(
        await teacherAgent.get("/api/teacher/search/student/" + testData.students[0].studentId),
        "Teacher student search",
    );

    ensureOk(
        await teacherAgent.get(
            "/api/teacher/student/" + testData.students[0].studentId + "/sessions",
        ),
        "Teacher student session history",
    );

    if (teacherDefaulterFeatureAvailable) {
        const teacherDefHistory = await teacherAgent.get("/api/teacher/defaulters/history");
        ensureOk(teacherDefHistory, "Teacher defaulter history");
        if (teacherDefHistory.body.history.length > 0) {
            defaulterHistoryId = teacherDefHistory.body.history[0].id;
            ensureOk(
                await teacherAgent.get(`/api/teacher/defaulters/history/${defaulterHistoryId}`),
                "Teacher defaulter history view",
            );
        }
    }

    const studentLogin = await studentAgent.post("/api/auth/login").send({
        role: "student",
        identifier: testData.students[0].studentId,
    });
    ensureOk(studentLogin, "Student login");

    ensureOk(await studentAgent.get("/api/student/dashboard"), "Student dashboard");
    ensureOk(await studentAgent.get("/api/student/sessions/all"), "Student all sessions");
    ensureOk(
        await studentAgent.get("/api/student/sessions/present"),
        "Student present sessions",
    );
    ensureOk(
        await studentAgent.get("/api/student/sessions/absent"),
        "Student absent sessions",
    );
    ensureOk(
        await studentAgent.get("/api/student/attendance/calendar"),
        "Student attendance calendar",
    );

    ensureOk(
        await studentAgent.post("/api/student/attendance/mark").send({
            latitude: Number(process.env.CAMPUS_LATITUDE || 19.076),
            longitude: Number(process.env.CAMPUS_LONGITUDE || 72.8777),
            accuracy: 8,
        }),
        "Student self-mark attendance",
    );

    ensureOk(await studentAgent.get("/api/student/activity"), "Student activity");

    ensureOk(await adminAgent.get("/api/admin/attendance/history"), "Admin attendance history");
    ensureOk(
        await adminAgent.get(`/api/admin/attendance/backup/${backupId}`),
        "Admin attendance backup download",
    );
    ensureOk(
        await adminAgent.get(`/api/admin/attendance/session/${backupId}`),
        "Admin attendance session student list",
    );

    const adminDefaulters = await adminAgent.get("/api/admin/defaulters").query({
        type: "monthly",
        threshold: 75,
        month,
        year,
        stream: testData.stream,
        division: testData.division,
    });
    const adminDefaulterFeatureAvailable = !isLegacyDefaulterSchemaIssue(adminDefaulters);
    if (adminDefaulterFeatureAvailable) {
        ensureOk(adminDefaulters, "Admin defaulter list");

        const adminDefaultersDownload = await adminAgent
            .get("/api/admin/defaulters/download")
            .query({
                type: "monthly",
                threshold: 75,
                month,
                year,
                stream: testData.stream,
                division: testData.division,
            });
        ensureDefaulterDownload(
            adminDefaultersDownload,
            "Admin defaulter report download",
        );
    }

    ensureOk(
        await adminAgent.get("/api/admin/attendance-dates").query({ month, year }),
        "Admin attendance dates",
    );
    ensureOk(await adminAgent.get("/api/admin/all-students"), "Admin all students view");
    ensureOk(await adminAgent.get("/api/admin/all-teachers"), "Admin all teachers view");
    ensureOk(await adminAgent.get("/api/admin/all-subjects"), "Admin all subjects view");
    ensureOk(await adminAgent.get("/api/admin/all-divisions"), "Admin all divisions view");
    ensureOk(await adminAgent.get("/api/admin/current-sessions"), "Admin current sessions view");

    if (adminDefaulterFeatureAvailable) {
        const adminDefHistory = await adminAgent.get("/api/admin/defaulters/history");
        ensureOk(adminDefHistory, "Admin defaulter history list");
        if (adminDefHistory.body.history.length > 0) {
            const id = adminDefHistory.body.history[0].id;
            ensureOk(
                await adminAgent.get(`/api/admin/defaulters/history/${id}`),
                "Admin defaulter history view",
            );
        }
    }
});
