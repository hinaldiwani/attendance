// ===================================================================
// TEACHER MANAGEMENT FUNCTIONS
// ===================================================================

/**
 * Search for teachers based on any field
 * GET /api/admin/teachers/search/:query
 */
export async function searchTeacher(req, res, next) {
    try {
        const { query } = req.params;

        if (!query) {
            return res.status(400).json({
                success: false,
                message: 'Search query is required'
            });
        }

        const searchTerm = `%${query}%`;

        // Search across all teacher fields
        const [teachers] = await pool.query(`
      SELECT 
        t.teacher_id,
        t.name,
        t.subject,
        t.year,
        t.stream,
        t.semester,
        t.division,
        t.status,
        COUNT(DISTINCT tsm.student_id) as student_count
      FROM teacher_details_db t
      LEFT JOIN teacher_student_map tsm ON t.teacher_id = tsm.teacher_id
      WHERE t.teacher_id LIKE ?
        OR t.name LIKE ?
        OR t.subject LIKE ?
        OR t.year LIKE ?
        OR t.stream LIKE ?
        OR t.semester LIKE ?
        OR t.division LIKE ?
      GROUP BY t.teacher_id, t.subject, t.year, t.stream, t.semester, t.division
      ORDER BY t.name ASC, t.subject ASC
    `, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]);

        return res.json({
            success: true,
            teachers,
            count: teachers.length
        });

    } catch (error) {
        console.error('Error searching teachers:', error);
        return next(error);
    }
}

/**
 * Add a new teacher with validation
 * POST /api/admin/teachers/add
 */
export async function addTeacher(req, res, next) {
    try {
        const { teacherId, name, subject, year, stream, semester, division, status } = req.body;

        // Validate required fields
        if (!teacherId || !name || !subject || !year || !stream) {
            return res.status(400).json({
                success: false,
                message: 'Required fields: teacherId, name, subject, year, stream'
            });
        }

        // Validate format
        const teacherIdRegex = /^[A-Z0-9]+$/;
        if (!teacherIdRegex.test(teacherId)) {
            return res.status(400).json({
                success: false,
                message: 'Teacher ID must contain only uppercase letters and numbers (e.g., TCH001)'
            });
        }

        // Validate year format
        const validYears = ['FY', 'SY', 'TY'];
        if (!validYears.includes(year.toUpperCase())) {
            return res.status(400).json({
                success: false,
                message: 'Year must be FY, SY, or TY'
            });
        }

        // Validate stream format
        const validStreams = ['BSCIT', 'BSCDS', 'BSC'];
        if (!validStreams.includes(stream.toUpperCase())) {
            return res.status(400).json({
                success: false,
                message: 'Stream must be BSCIT, BSCDS, or BSC'
            });
        }

        // Validate division format (comma-separated letters)
        if (division && !/^[A-Z](,[A-Z])*$/.test(division)) {
            return res.status(400).json({
                success: false,
                message: 'Division must be comma-separated uppercase letters (e.g., A,B,C)'
            });
        }

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Check if teacher already exists
            const [existing] = await connection.query(
                `SELECT * FROM teacher_details_db 
         WHERE teacher_id = ? AND subject = ? AND year = ? AND stream = ? AND semester = ?`,
                [teacherId, subject, year, stream, semester || '']
            );

            if (existing.length > 0) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: 'Teacher with this ID, subject, year, stream, and semester already exists'
                });
            }

            // Insert new teacher
            await connection.query(
                `INSERT INTO teacher_details_db 
         (teacher_id, name, subject, year, stream, semester, division, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    teacherId.toUpperCase(),
                    name.trim(),
                    subject.trim(),
                    year.toUpperCase(),
                    stream.toUpperCase(),
                    semester || '',
                    division || '',
                    status || 'Active'
                ]
            );

            // Backup to teacher_status_backup
            await connection.query(
                `INSERT INTO teacher_status_backup 
         (teacher_id, name, subject, year, stream, semester, division, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    teacherId.toUpperCase(),
                    name.trim(),
                    subject.trim(),
                    year.toUpperCase(),
                    stream.toUpperCase(),
                    semester || '',
                    division || '',
                    status || 'Active'
                ]
            );

            // Log activity
            await connection.query(
                `INSERT INTO activity_logs (actor_role, actor_id, action, details, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
                [
                    'admin',
                    req.session.user?.id || 'system',
                    'ADD_TEACHER',
                    JSON.stringify({ teacherId, name, subject })
                ]
            );

            await connection.commit();

            return res.json({
                success: true,
                message: 'Teacher added successfully',
                teacher: {
                    teacherId: teacherId.toUpperCase(),
                    name: name.trim(),
                    subject: subject.trim(),
                    year: year.toUpperCase(),
                    stream: stream.toUpperCase(),
                    semester: semester || '',
                    division: division || '',
                    status: status || 'Active'
                }
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Error adding teacher:', error);
        return next(error);
    }
}

/**
 * Remove a teacher (soft delete) and set status to Inactive
 * DELETE /api/admin/teachers/remove
 */
export async function removeTeacher(req, res, next) {
    try {
        const { teacherId, subject, year, stream, semester } = req.body;

        if (!teacherId) {
            return res.status(400).json({
                success: false,
                message: 'Teacher ID is required'
            });
        }

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Build WHERE clause based on provided parameters
            let whereConditions = ['teacher_id = ?'];
            let params = [teacherId];

            if (subject) {
                whereConditions.push('subject = ?');
                params.push(subject);
            }
            if (year) {
                whereConditions.push('year = ?');
                params.push(year);
            }
            if (stream) {
                whereConditions.push('stream = ?');
                params.push(stream);
            }
            if (semester) {
                whereConditions.push('semester = ?');
                params.push(semester);
            }

            const whereClause = whereConditions.join(' AND ');

            // Get teachers to be removed
            const [teachers] = await connection.query(
                `SELECT * FROM teacher_details_db WHERE ${whereClause}`,
                params
            );

            if (teachers.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'No matching teachers found'
                });
            }

            // Set status to Inactive instead of deleting
            await connection.query(
                `UPDATE teacher_details_db SET status = 'Inactive' WHERE ${whereClause}`,
                params
            );

            // Backup removed teachers
            for (const teacher of teachers) {
                await connection.query(
                    `UPDATE teacher_status_backup 
           SET status = 'Inactive', removed_at = NOW(), removed_by = ?
           WHERE teacher_id = ? AND subject = ? AND year = ? AND stream = ?`,
                    [
                        req.session.user?.id || 'system',
                        teacher.teacher_id,
                        teacher.subject,
                        teacher.year,
                        teacher.stream
                    ]
                );
            }

            // Log activity
            await connection.query(
                `INSERT INTO activity_logs (actor_role, actor_id, action, details, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
                [
                    'admin',
                    req.session.user?.id || 'system',
                    'REMOVE_TEACHER',
                    JSON.stringify({ teacherId, count: teachers.length })
                ]
            );

            await connection.commit();

            return res.json({
                success: true,
                message: `${teachers.length} teacher(s) removed and set to Inactive`,
                removedCount: teachers.length,
                teachers: teachers.map(t => ({
                    teacherId: t.teacher_id,
                    name: t.name,
                    subject: t.subject
                }))
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Error removing teacher:', error);
        return next(error);
    }
}

/**
 * Configure teacher status (Active/Inactive)
 * PUT /api/admin/teachers/status
 */
export async function configureTeacherStatus(req, res, next) {
    try {
        const { teacherId, subject, year, stream, semester, status } = req.body;

        if (!teacherId || !status) {
            return res.status(400).json({
                success: false,
                message: 'Teacher ID and status are required'
            });
        }

        if (!['Active', 'Inactive'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status must be either Active or Inactive'
            });
        }

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Build WHERE clause
            let whereConditions = ['teacher_id = ?'];
            let params = [teacherId];

            if (subject) {
                whereConditions.push('subject = ?');
                params.push(subject);
            }
            if (year) {
                whereConditions.push('year = ?');
                params.push(year);
            }
            if (stream) {
                whereConditions.push('stream = ?');
                params.push(stream);
            }
            if (semester) {
                whereConditions.push('semester = ?');
                params.push(semester);
            }

            params.push(status);
            const whereClause = whereConditions.join(' AND ');

            // Update status
            const [result] = await connection.query(
                `UPDATE teacher_details_db SET status = ? WHERE ${whereClause}`,
                params
            );

            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'No matching teachers found'
                });
            }

            // Update backup table
            const backupParams = [status, teacherId];
            let backupWhere = 'teacher_id = ?';

            if (subject) {
                backupWhere += ' AND subject = ?';
                backupParams.push(subject);
            }
            if (year) {
                backupWhere += ' AND year = ?';
                backupParams.push(year);
            }
            if (stream) {
                backupWhere += ' AND stream = ?';
                backupParams.push(stream);
            }

            await connection.query(
                `UPDATE teacher_status_backup SET status = ? WHERE ${backupWhere}`,
                backupParams
            );

            // Log activity
            await connection.query(
                `INSERT INTO activity_logs (actor_role, actor_id, action, details, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
                [
                    'admin',
                    req.session.user?.id || 'system',
                    'CONFIGURE_TEACHER_STATUS',
                    JSON.stringify({ teacherId, status, affectedRows: result.affectedRows })
                ]
            );

            await connection.commit();

            return res.json({
                success: true,
                message: `Status updated to ${status} for ${result.affectedRows} teacher(s)`,
                affectedRows: result.affectedRows
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Error configuring teacher status:', error);
        return next(error);
    }
}

/**
 * Get all teachers with their status
 * GET /api/admin/teachers/all
 */
export async function getAllTeachersWithStatus(req, res, next) {
    try {
        const { status } = req.query;

        let query = `
      SELECT 
        t.teacher_id,
        t.name,
        t.subject,
        t.year,
        t.stream,
        t.semester,
        t.division,
        t.status,
        COUNT(DISTINCT tsm.student_id) as student_count
      FROM teacher_details_db t
      LEFT JOIN teacher_student_map tsm ON t.teacher_id = tsm.teacher_id
    `;

        const params = [];

        if (status && ['Active', 'Inactive'].includes(status)) {
            query += ' WHERE t.status = ?';
            params.push(status);
        }

        query += ' GROUP BY t.teacher_id, t.subject, t.year, t.stream, t.semester, t.division ORDER BY t.name ASC, t.subject ASC';

        const [teachers] = await pool.query(query, params);

        return res.json({
            success: true,
            teachers,
            count: teachers.length
        });

    } catch (error) {
        console.error('Error fetching teachers:', error);
        return next(error);
    }
}
