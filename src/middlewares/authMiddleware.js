import pool from "../../config/db.js";

function shouldRedirectToLogin(req) {
  const fetchDest = req.get("sec-fetch-dest") || "";
  const acceptsHtml = req.accepts(["html", "json"]) === "html";
  const isPageRequest = fetchDest === "document";
  return (req.method === "GET" || req.method === "HEAD") && (acceptsHtml || isPageRequest);
}

export function requireAuth(req, res, next) {
  if (!req.session?.user) {
    if (shouldRedirectToLogin(req)) {
      return res.redirect("/");
    }
    return res.status(401).json({ message: "Authentication required" });
  }
  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session?.user || !roles.includes(req.session.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    return next();
  };
}

export async function requireActiveTeacher(req, res, next) {
  try {
    if (!req.session?.user || req.session.user.role !== "teacher") {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    const teacherId = req.session.user.id;
    const [rows] = await pool.query(
      `SELECT
         CASE
           WHEN SUM(CASE WHEN UPPER(COALESCE(status, 'Active')) = 'INACTIVE' THEN 1 ELSE 0 END) > 0
             THEN 'Inactive'
           ELSE 'Active'
         END AS status
       FROM teacher_details_db
       WHERE teacher_id = ?`,
      [teacherId],
    );

    const status = rows?.[0]?.status || "Active";
    if (String(status).toLowerCase() === "inactive") {
      return res.status(403).json({
        message:
          "Your account is inactive. Contact the administrator. Access to dashboard actions is restricted.",
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

export async function requireActiveStudent(req, res, next) {
  try {
    if (!req.session?.user || req.session.user.role !== "student") {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    const studentId = req.session.user.id;
    let rows = [];
    try {
      const [result] = await pool.query(
        `SELECT COALESCE(status, 'Active') AS status
         FROM student_details_db
         WHERE student_id = ?
         LIMIT 1`,
        [studentId],
      );
      rows = result;
    } catch (dbError) {
      if (dbError.code === "ER_BAD_FIELD_ERROR") {
        const [result] = await pool.query(
          `SELECT 'Active' AS status
           FROM student_details_db
           WHERE student_id = ?
           LIMIT 1`,
          [studentId],
        );
        rows = result;
      } else {
        throw dbError;
      }
    }

    if (!rows?.length) {
      return res.status(404).json({ message: "Student account not found" });
    }

    const status = rows[0].status || "Active";
    if (String(status).toLowerCase() === "inactive") {
      return res.status(403).json({
        message:
          "Your account is inactive. Contact the administrator. Access is restricted.",
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}
