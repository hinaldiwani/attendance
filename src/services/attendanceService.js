import pool from "../../config/db.js";

export async function getMappedStudents(teacherId) {
  const [rows] = await pool.query(
    `SELECT s.student_id, s.student_name, s.roll_no, s.stream, s.division, s.year
     FROM student_details_db s
     INNER JOIN teacher_student_map m ON s.student_id = m.student_id
     WHERE m.teacher_id = ?
     ORDER BY s.student_id ASC`,
    [teacherId],
  );
  return rows;
}

export async function createAttendanceSession({
  teacherId,
  subject,
  year,
  semester,
  division,
  stream,
}) {
  // Generate unique session ID
  const sessionId = `SES_${teacherId}_${Date.now()}`;

  await pool.query(
    `INSERT INTO attendance_sessions 
      (session_id, teacher_id, subject, year, semester, division, stream, started_at, status) 
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 'active')`,
    [sessionId, teacherId, subject, year, semester, division, stream],
  );

  return sessionId;
}

export async function finalizeAttendanceSession(
  sessionId,
  teacherId,
  attendanceRecords,
) {
  if (!Array.isArray(attendanceRecords) || attendanceRecords.length === 0) {
    throw new Error("Attendance records are required to finalize session");
  }

  // Remove duplicate student IDs (keep the last occurrence)
  const uniqueRecords = [];
  const seenStudents = new Set();

  // Process in reverse to keep the last occurrence of each student
  for (let i = attendanceRecords.length - 1; i >= 0; i--) {
    const record = attendanceRecords[i];
    if (!seenStudents.has(record.studentId)) {
      seenStudents.add(record.studentId);
      uniqueRecords.unshift(record);
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Update session end time and summary
    const present = uniqueRecords.filter(
      (record) => record.status === "P",
    ).length;
    const absent = uniqueRecords.length - present;

    await connection.query(
      `UPDATE attendance_sessions 
       SET ended_at = NOW(), present_count = ?, absent_count = ?, status = 'completed' 
       WHERE session_id = ? AND teacher_id = ?`,
      [present, absent, sessionId, teacherId],
    );

    // Insert attendance records (or update if duplicate)
    const values = uniqueRecords.map(() => "(?, ?, ?, ?, NOW())").join(",");
    const params = uniqueRecords.flatMap((record) => [
      sessionId,
      teacherId,
      record.studentId,
      record.status,
    ]);

    await connection.query(
      `INSERT INTO attendance_records 
        (session_id, teacher_id, student_id, status, marked_at) 
       VALUES ${values}
       ON DUPLICATE KEY UPDATE 
        status = VALUES(status),
        marked_at = NOW()`,
      params,
    );

    await connection.commit();
    return { present, absent };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getTeacherStats(teacherId) {
  const [sessions] = await pool.query(
    `SELECT COUNT(*) as session_count,
            SUM(present_count) as total_present,
            SUM(absent_count) as total_absent
     FROM attendance_sessions
     WHERE teacher_id = ?`,
    [teacherId],
  );

  const summary = sessions[0] || {
    session_count: 0,
    total_present: 0,
    total_absent: 0,
  };

  const total = (summary.total_present || 0) + (summary.total_absent || 0);
  const average = total
    ? Math.round(((summary.total_present || 0) / total) * 100)
    : 0;

  const [recentSessions] = await pool.query(
    `SELECT session_id, subject, division, started_at, present_count, absent_count
     FROM attendance_sessions
     WHERE teacher_id = ?
     ORDER BY started_at DESC
     LIMIT 10`,
    [teacherId],
  );

  return {
    summary: {
      sessions: summary.session_count || 0,
      totalPresent: summary.total_present || 0,
      totalAbsent: summary.total_absent || 0,
      averagePercentage: average,
    },
    recentSessions,
  };
}

export async function getStudentStats(studentId) {
  const [records] = await pool.query(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) as present,
            SUM(CASE WHEN status = 'A' THEN 1 ELSE 0 END) as absent
     FROM attendance_records
     WHERE student_id = ?`,
    [studentId],
  );

  const stats = records[0] || { total: 0, present: 0, absent: 0 };
  const total = stats.total || 0;
  const present = stats.present || 0;
  const absent = stats.absent || 0;
  const percentage = total ? Math.round((present / total) * 100) : 0;

  const [recentSessions] = await pool.query(
    `SELECT session_date, subject, status
     FROM attendance_records
     WHERE student_id = ?
     ORDER BY session_date DESC
     LIMIT 10`,
    [studentId],
  );

  // Subject breakdown
  const [subjectBreakdown] = await pool.query(
    `SELECT subject,
            COUNT(*) as total,
            SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) as present
     FROM attendance_records
     WHERE student_id = ?
     GROUP BY subject`,
    [studentId],
  );

  return {
    present,
    absent,
    total,
    percentage,
    recentSessions,
    subjectBreakdown,
  };
}

export async function logAttendanceToAggregate(records, sessionMeta) {
  if (!records?.length) return;

  // Remove duplicate student IDs (keep the last occurrence)
  const uniqueRecords = [];
  const seenStudents = new Set();

  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    if (!seenStudents.has(record.studentId)) {
      seenStudents.add(record.studentId);
      uniqueRecords.unshift(record);
    }
  }

  const values = uniqueRecords
    .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())")
    .join(",");
  const params = uniqueRecords.flatMap((record) => [
    sessionMeta.sessionId,
    sessionMeta.teacherId,
    record.studentId,
    sessionMeta.subject,
    sessionMeta.year,
    sessionMeta.stream,
    sessionMeta.division,
    record.status,
    sessionMeta.sessionDate,
  ]);

  await pool.query(
    `INSERT INTO attendance_records 
      (session_id, teacher_id, student_id, subject, year, stream, division, status, session_date, marked_at) 
     VALUES ${values}
     ON DUPLICATE KEY UPDATE 
      subject = VALUES(subject),
      year = VALUES(year),
      stream = VALUES(stream),
      division = VALUES(division),
      status = VALUES(status),
      session_date = VALUES(session_date),
      marked_at = NOW()`,
    params,
  );

  // Update attendance statistics tables
  await updateAttendanceStats(uniqueRecords, sessionMeta);
}

export async function updateAttendanceStats(records, sessionMeta) {
  if (!records?.length) return;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const month = sessionMeta.sessionDate.getMonth() + 1; // 1-12
    const year_value = sessionMeta.sessionDate.getFullYear();

    for (const record of records) {
      // Get student details
      const [studentData] = await connection.query(
        "SELECT student_name, roll_no FROM student_details_db WHERE student_id = ?",
        [record.studentId],
      );

      if (studentData.length === 0) continue;

      const student = studentData[0];

      // Update monthly_attendance_summary
      await connection.query(
        `
        INSERT INTO monthly_attendance_summary 
          (student_id, student_name, roll_no, year, stream, division, subject, 
           month, year_value, total_lectures, attended_lectures, attendance_percentage, is_defaulter)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          total_lectures = total_lectures + 1,
          attended_lectures = attended_lectures + IF(VALUES(attended_lectures) > 0, 1, 0),
          attendance_percentage = ROUND((attended_lectures / total_lectures) * 100, 2),
          is_defaulter = IF(ROUND((attended_lectures / total_lectures) * 100, 2) < 75, TRUE, FALSE),
          last_updated = CURRENT_TIMESTAMP
      `,
        [
          record.studentId,
          student.student_name,
          student.roll_no,
          sessionMeta.year,
          sessionMeta.stream,
          sessionMeta.division,
          sessionMeta.subject,
          month,
          year_value,
          record.status === "P" ? 1 : 0,
          0, // attendance_percentage placeholder
          false, // is_defaulter placeholder
        ],
      );

      // Update student_attendance_stats
      await connection.query(
        `
        INSERT INTO student_attendance_stats 
          (student_id, student_name, roll_no, year, stream, division, subject, 
           total_lectures, attended_lectures, attendance_percentage, is_defaulter)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          total_lectures = total_lectures + 1,
          attended_lectures = attended_lectures + IF(VALUES(attended_lectures) > 0, 1, 0),
          attendance_percentage = ROUND((attended_lectures / total_lectures) * 100, 2),
          is_defaulter = IF(ROUND((attended_lectures / total_lectures) * 100, 2) < 75, TRUE, FALSE),
          last_updated = CURRENT_TIMESTAMP
      `,
        [
          record.studentId,
          student.student_name,
          student.roll_no,
          sessionMeta.year,
          sessionMeta.stream,
          sessionMeta.division,
          sessionMeta.subject,
          record.status === "P" ? 1 : 0,
          0, // attendance_percentage placeholder
          false, // is_defaulter placeholder
        ],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error("Error updating attendance stats:", error);
    throw error;
  } finally {
    connection.release();
  }
}
