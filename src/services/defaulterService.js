import pool from "../../config/db.js";
import ExcelJS from "exceljs";

class DefaulterService {
    /**
     * Get defaulter list for a specific month with custom threshold
     * NOW CALCULATES OVERALL ATTENDANCE ACROSS ALL SUBJECTS
     * Supports date range filtering when start_date or end_date are provided
     */
    async getDefaulterList(filters = {}) {
        const { month, year, stream, division, subject, threshold = 75, teacherId = null, start_date, end_date } = filters;

        // If date filtering is requested, use a different query based on attendance_sessions
        if (start_date || end_date) {
            return this.getDefaulterListByDateRange(filters);
        }

        // NEW APPROACH: Calculate overall attendance across ALL subjects for each student
        let query = `
      SELECT 
        s.student_id,
        s.student_name,
        s.roll_no,
        s.year,
        s.stream,
        s.division,
        SUM(mas.total_sessions) as total_lectures,
        SUM(mas.present_sessions) as attended_lectures,
        ROUND((SUM(mas.present_sessions) / NULLIF(SUM(mas.total_sessions), 0)) * 100, 2) as attendance_percentage,
        GROUP_CONCAT(DISTINCT mas.subject ORDER BY mas.subject SEPARATOR ', ') as subjects,
        COUNT(DISTINCT mas.subject) as subject_count,
        mas.month_val as month,
        mas.year_val as year_value,
        CASE 
          WHEN mas.month_val = 1 THEN 'January'
          WHEN mas.month_val = 2 THEN 'February'
          WHEN mas.month_val = 3 THEN 'March'
          WHEN mas.month_val = 4 THEN 'April'
          WHEN mas.month_val = 5 THEN 'May'
          WHEN mas.month_val = 6 THEN 'June'
          WHEN mas.month_val = 7 THEN 'July'
          WHEN mas.month_val = 8 THEN 'August'
          WHEN mas.month_val = 9 THEN 'September'
          WHEN mas.month_val = 10 THEN 'October'
          WHEN mas.month_val = 11 THEN 'November'
          WHEN mas.month_val = 12 THEN 'December'
        END as month_name
      FROM student_details_db s
      INNER JOIN monthly_attendance_summary mas ON s.student_id = mas.student_id
    `;

        const params = [];

        // If teacherId is provided, filter students based on teacher-student mappings
        if (teacherId) {
            query += `
      INNER JOIN teacher_student_map tsm ON s.student_id = tsm.student_id
      WHERE tsm.teacher_id = ?
      `;
            params.push(teacherId);
        } else {
            query += ` WHERE 1=1`;
        }

        if (month) {
            query += ` AND mas.month_val = ?`;
            params.push(month);
        }

        if (year) {
            query += ` AND mas.year_val = ?`;
            params.push(year);
        }

        if (stream) {
            query += ` AND s.stream = ?`;
            params.push(stream);
        }

        if (division) {
            query += ` AND s.division = ?`;
            params.push(division);
        }

        // NOTE: Do NOT filter by subject here - we want ALL subjects for overall attendance
        // The subject filter would exclude students who have other subjects

        // Group by student to calculate overall attendance
        query += ` 
      GROUP BY s.student_id, s.student_name, s.roll_no, s.year, s.stream, s.division, mas.month_val, mas.year_val
      HAVING attendance_percentage < ?
      ORDER BY s.year DESC, mas.month_val DESC, 
        CASE 
          WHEN s.stream = 'BSCIT' THEN 1
          WHEN s.stream = 'BSCDS' THEN 2
          ELSE 3
        END, 
        s.division, 
        s.student_id, 
        s.student_name
    `;

        params.push(threshold);

        const [rows] = await pool.query(query, params);
        return rows;
    }

    /**
     * Get defaulter list filtered by date range
     * Calculates attendance based on actual attendance sessions within the date range
     */
    async getDefaulterListByDateRange(filters = {}) {
        const { month, year, stream, division, threshold = 75, teacherId = null, start_date, end_date } = filters;

        let query = `
      SELECT 
        s.student_id,
        s.student_name,
        s.roll_no,
        s.year,
        s.stream,
        s.division,
        COUNT(DISTINCT ases.session_id) as total_lectures,
        SUM(CASE WHEN ar.status = 'P' THEN 1 ELSE 0 END) as attended_lectures,
        ROUND((SUM(CASE WHEN ar.status = 'P' THEN 1 ELSE 0 END) / NULLIF(COUNT(DISTINCT ases.session_id), 0)) * 100, 2) as attendance_percentage,
        GROUP_CONCAT(DISTINCT ases.subject ORDER BY ases.subject SEPARATOR ', ') as subjects,
        COUNT(DISTINCT ases.subject) as subject_count,
        MIN(MONTH(ases.started_at)) as month,
        MIN(YEAR(ases.started_at)) as year_value,
        CASE 
          WHEN MIN(MONTH(ases.started_at)) = MAX(MONTH(ases.started_at)) THEN
            CASE MIN(MONTH(ases.started_at))
              WHEN 1 THEN 'January'
              WHEN 2 THEN 'February'
              WHEN 3 THEN 'March'
              WHEN 4 THEN 'April'
              WHEN 5 THEN 'May'
              WHEN 6 THEN 'June'
              WHEN 7 THEN 'July'
              WHEN 8 THEN 'August'
              WHEN 9 THEN 'September'
              WHEN 10 THEN 'October'
              WHEN 11 THEN 'November'
              WHEN 12 THEN 'December'
            END
          ELSE CONCAT(
            CASE MIN(MONTH(ases.started_at))
              WHEN 1 THEN 'Jan'
              WHEN 2 THEN 'Feb'
              WHEN 3 THEN 'Mar'
              WHEN 4 THEN 'Apr'
              WHEN 5 THEN 'May'
              WHEN 6 THEN 'Jun'
              WHEN 7 THEN 'Jul'
              WHEN 8 THEN 'Aug'
              WHEN 9 THEN 'Sep'
              WHEN 10 THEN 'Oct'
              WHEN 11 THEN 'Nov'
              WHEN 12 THEN 'Dec'
            END,
            ' - ',
            CASE MAX(MONTH(ases.started_at))
              WHEN 1 THEN 'Jan'
              WHEN 2 THEN 'Feb'
              WHEN 3 THEN 'Mar'
              WHEN 4 THEN 'Apr'
              WHEN 5 THEN 'May'
              WHEN 6 THEN 'Jun'
              WHEN 7 THEN 'Jul'
              WHEN 8 THEN 'Aug'
              WHEN 9 THEN 'Sep'
              WHEN 10 THEN 'Oct'
              WHEN 11 THEN 'Nov'
              WHEN 12 THEN 'Dec'
            END
          )
        END as month_name
      FROM student_details_db s
      LEFT JOIN attendance_records ar ON s.student_id = ar.student_id
      LEFT JOIN attendance_sessions ases ON ar.session_id = ases.session_id
    `;

        const params = [];

        // Build WHERE clause
        let whereClause = ' WHERE 1=1';

        // If teacherId is provided, filter students based on teacher-student mappings
        if (teacherId) {
            query += `
      INNER JOIN teacher_student_map tsm ON s.student_id = tsm.student_id
      `;
            whereClause += ` AND tsm.teacher_id = ?`;
            params.push(teacherId);
        }

        // Date filtering
        if (start_date) {
            whereClause += ` AND DATE(ases.started_at) >= ?`;
            params.push(start_date);
        }

        if (end_date) {
            whereClause += ` AND DATE(ases.started_at) <= ?`;
            params.push(end_date);
        }

        // Month filtering (only if no specific dates provided, or to narrow down date range)
        if (month && !start_date && !end_date) {
            whereClause += ` AND MONTH(ases.started_at) = ?`;
            params.push(month);
        }

        if (year) {
            whereClause += ` AND YEAR(ases.started_at) = ?`;
            params.push(year);
        }

        if (stream) {
            whereClause += ` AND s.stream = ?`;
            params.push(stream);
        }

        if (division) {
            whereClause += ` AND s.division = ?`;
            params.push(division);
        }

        query += whereClause;

        // Group by student to calculate overall attendance
        query += ` 
      GROUP BY s.student_id, s.student_name, s.roll_no, s.year, s.stream, s.division
      HAVING total_lectures > 0 AND attendance_percentage < ?
      ORDER BY s.year DESC, 
        CASE 
          WHEN s.stream = 'BSCIT' THEN 1
          WHEN s.stream = 'BSCDS' THEN 2
          ELSE 3
        END, 
        s.division, 
        s.student_id, 
        s.student_name
    `;

        params.push(threshold);

        const [rows] = await pool.query(query, params);
        return rows;
    }

    /**
     * Get overall defaulters (across all subjects) with custom threshold
     * NOW CALCULATES OVERALL ATTENDANCE ACROSS ALL SUBJECTS
     */
    async getOverallDefaulters(filters = {}) {
        const { stream, division, year, threshold = 75, teacherId = null } = filters;

        // Calculate overall attendance across ALL subjects for each student
        let query = `
      SELECT 
        s.student_id,
        s.student_name,
        s.roll_no,
        s.year,
        s.stream,
        s.division,
        SUM(sas.total_sessions) as total_lectures,
        SUM(sas.present_count) as attended_lectures,
        ROUND((SUM(sas.present_count) / NULLIF(SUM(sas.total_sessions), 0)) * 100, 2) as attendance_percentage,
        GROUP_CONCAT(DISTINCT sas.subject ORDER BY sas.subject SEPARATOR ', ') as subjects,
        COUNT(DISTINCT sas.subject) as subject_count
      FROM student_details_db s
      INNER JOIN student_attendance_stats sas ON s.student_id = sas.student_id
    `;

        const params = [];

        // If teacherId is provided, filter students based on teacher-student mappings
        if (teacherId) {
            query += `
      INNER JOIN teacher_student_map tsm ON s.student_id = tsm.student_id
      WHERE tsm.teacher_id = ?
      `;
            params.push(teacherId);
        } else {
            query += ` WHERE 1=1`;
        }

        if (stream) {
            query += ` AND s.stream = ?`;
            params.push(stream);
        }

        if (division) {
            query += ` AND s.division = ?`;
            params.push(division);
        }

        if (year) {
            query += ` AND s.year = ?`;
            params.push(year);
        }

        // Group by student to calculate overall attendance
        query += ` 
      GROUP BY s.student_id, s.student_name, s.roll_no, s.year, s.stream, s.division
      HAVING attendance_percentage < ?
      ORDER BY 
        CASE 
          WHEN s.stream = 'BSCIT' THEN 1
          WHEN s.stream = 'BSCDS' THEN 2
          ELSE 3
        END, 
        s.division, 
        s.student_id, 
        s.student_name
    `;

        params.push(threshold);

        const [rows] = await pool.query(query, params);
        return rows;
    }

    /**
     * Generate Excel file for defaulter list
     */
    async generateDefaulterExcel(defaulters, options = {}) {
        const { month, year, type = "monthly", threshold = 75 } = options;

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Defaulter List");

        // Add title row with threshold information
        worksheet.mergeCells('A1:L1');
        const titleRow = worksheet.getRow(1);
        titleRow.getCell(1).value = `Defaulter List - Students with Attendance Below ${threshold}%`;
        titleRow.getCell(1).font = { bold: true, size: 14 };
        titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 25;

        // Set column headers
        const headers =
            type === "monthly"
                ? [
                    "Student ID",
                    "Name",
                    "Roll No",
                    "Year",
                    "Stream",
                    "Division",
                    "Subjects (All)",
                    "Subject Count",
                    "Month",
                    "Year",
                    "Total Lectures (All Subjects)",
                    "Attended (All Subjects)",
                    "Overall Attendance %",
                ]
                : [
                    "Student ID",
                    "Name",
                    "Roll No",
                    "Year",
                    "Stream",
                    "Division",
                    "Subjects (All)",
                    "Subject Count",
                    "Total Lectures (All Subjects)",
                    "Attended (All Subjects)",
                    "Overall Attendance %",
                ];

        worksheet.addRow(headers);

        // Style header row
        worksheet.getRow(2).font = { bold: true };
        worksheet.getRow(2).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE0E0E0" },
        };

        // Add data rows
        defaulters.forEach((defaulter) => {
            const row =
                type === "monthly"
                    ? [
                        defaulter.student_id,
                        defaulter.student_name,
                        defaulter.roll_no,
                        defaulter.year,
                        defaulter.stream,
                        defaulter.division,
                        defaulter.subjects || defaulter.subject || "N/A",
                        defaulter.subject_count || 1,
                        defaulter.month_name || defaulter.month,
                        defaulter.year_value,
                        defaulter.total_lectures,
                        defaulter.attended_lectures,
                        defaulter.attendance_percentage,
                    ]
                    : [
                        defaulter.student_id,
                        defaulter.student_name,
                        defaulter.roll_no,
                        defaulter.year,
                        defaulter.stream,
                        defaulter.division,
                        defaulter.subjects || defaulter.subject || "N/A",
                        defaulter.subject_count || 1,
                        defaulter.total_lectures,
                        defaulter.attended_lectures,
                        defaulter.attendance_percentage,
                    ];

            worksheet.addRow(row);
        });

        // Auto-fit columns
        worksheet.columns.forEach((column) => {
            column.width = 15;
        });

        return workbook;
    }

    /**
     * Save defaulter generation to history
     */
    async saveDefaulterHistory(defaulters, generatedBy, role) {
        if (defaulters.length === 0) return;

        const values = defaulters.map((d) => [
            d.student_id,
            d.student_name,
            d.roll_no,
            d.year,
            d.stream,
            d.division,
            d.subjects || d.subject || 'N/A',
            d.month,
            d.year_value,
            d.attendance_percentage,
            generatedBy,
            role,
        ]);

        const query = `
      INSERT INTO defaulter_history 
      (student_id, student_name, roll_no, year, stream, division, subject, 
       month, year_value, attendance_percentage, generated_by, generated_by_role)
      VALUES ?
    `;

        await pool.query(query, [values]);
    }

    /**
     * Get student's defaulter status
     */
    async getStudentDefaulterStatus(studentId) {
        const query = `
      SELECT 
        sas.subject,
        sas.total_sessions as total_lectures,
        sas.present_count as attended_lectures,
        sas.attendance_percentage,
        (sas.attendance_percentage < 75) as is_defaulter,
        mas.month_val as month,
        mas.year_val as year_value,
        CASE 
          WHEN mas.month_val = 1 THEN 'January'
          WHEN mas.month_val = 2 THEN 'February'
          WHEN mas.month_val = 3 THEN 'March'
          WHEN mas.month_val = 4 THEN 'April'
          WHEN mas.month_val = 5 THEN 'May'
          WHEN mas.month_val = 6 THEN 'June'
          WHEN mas.month_val = 7 THEN 'July'
          WHEN mas.month_val = 8 THEN 'August'
          WHEN mas.month_val = 9 THEN 'September'
          WHEN mas.month_val = 10 THEN 'October'
          WHEN mas.month_val = 11 THEN 'November'
          WHEN mas.month_val = 12 THEN 'December'
        END as month_name
      FROM student_attendance_stats sas
      LEFT JOIN monthly_attendance_summary mas 
        ON sas.student_id = mas.student_id 
        AND sas.subject = mas.subject
        AND mas.month_val = MONTH(CURRENT_DATE)
        AND mas.year_val = YEAR(CURRENT_DATE)
      WHERE sas.student_id = ?
      ORDER BY sas.subject
    `;

        const [rows] = await pool.query(query, [studentId]);

        const isDefaulter = rows.some((row) => row.is_defaulter);
        const defaulterSubjects = rows
            .filter((row) => row.is_defaulter)
            .map((row) => row.subject);

        return {
            isDefaulter,
            defaulterSubjects,
            details: rows,
        };
    }

    /**
     * Update monthly attendance summaries (call this after marking attendance)
     */
    async updateMonthlyAttendance() {
        await pool.query("CALL update_monthly_attendance()");
    }
}

export default new DefaulterService();
