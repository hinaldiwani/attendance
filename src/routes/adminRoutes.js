import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

import {
  handleStudentImport,
  handleTeacherImport,
  confirmImport,
  getImportPreview,
  fetchImportActivity,
  fetchDashboardStats,
  downloadTemplate,
  getAttendanceHistory,
  downloadAttendanceBackup,
  deleteAllData,
  clearAttendanceHistory,
  triggerAutoMapping,
  getDefaulterList,
  downloadDefaulterList,
  updateMonthlyAttendance,
  getAttendanceDates,
  getTeachersInfo,
  addTeacher,
  getTeacherForEdit,
  updateTeacherInfo,
  updateTeacherTeachingStatus,
  addStudent,
  getStudentForEdit,
  updateStudentInfo,
  updateStudentStatus,
  bulkUpdateStudentStatus,
  getStudentsInfo,
  getStreamsDivisions,
  getTeacherDivisions,
  getStudentDivisions,
  getTeacherStreams,
  getStudentStreams,
  getSessionStudents,
  deleteAttendanceSession,
  getAllStudents,
  getAllTeachers,
  getAllSubjects,
  getAllDivisions,
  getCurrentSessions,
  getStudentsByFilters,
  getAdminDefaulterHistory,
  viewAdminDefaulterHistoryEntry,
  deleteAdminDefaulterHistoryEntry,
  downloadAdminDefaulterHistoryEntry,
  searchStudent,
  searchTeacher,
  getStudentSessionAttendance,
  changeAdminPassword,
} from "../controllers/adminController.js";
import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";
import notificationService from "../services/notificationService.js";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

const storage = multer.diskStorage({
  destination: path.join(rootDir, "uploads"),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname || ".xlsx");
    cb(null, `${file.fieldname}-${timestamp}${ext}`);
  },
});

const upload = multer({ storage });

router.use(requireAuth, requireRole("admin"));

router.post("/import/students", upload.single("file"), handleStudentImport);
router.post("/import/teachers", upload.single("file"), handleTeacherImport);
router.post("/import/confirm", confirmImport);
router.get("/import/preview", getImportPreview);
router.get("/activity", fetchImportActivity);
router.get("/stats", fetchDashboardStats);
router.get("/dashboard", fetchDashboardStats);
router.get("/templates/:type", downloadTemplate);
router.get("/attendance/history", getAttendanceHistory);
router.get("/attendance/backup/:id", downloadAttendanceBackup);
router.get("/attendance/session/:id", getSessionStudents);
router.delete("/attendance/session/:id", deleteAttendanceSession);
router.post("/delete-all-data", deleteAllData);
router.post("/attendance/clear-history", clearAttendanceHistory);
router.post("/auto-map-students", triggerAutoMapping);

// Defaulter management routes
router.get("/defaulters", getDefaulterList);
router.get("/defaulters/download", downloadDefaulterList);
router.get("/defaulters/history", getAdminDefaulterHistory);
router.get("/defaulters/history/:id", viewAdminDefaulterHistoryEntry);
router.get(
  "/defaulters/history/:id/download",
  downloadAdminDefaulterHistoryEntry,
);
router.delete("/defaulters/history/:id", deleteAdminDefaulterHistoryEntry);
router.get("/attendance-dates", getAttendanceDates);

// Teacher and Student information routes
router.get("/teachers-info", getTeachersInfo);
router.post("/teachers/add", addTeacher);
router.get("/teachers/:teacherId/edit", getTeacherForEdit);
router.put("/teachers/:teacherId/update", updateTeacherInfo);
router.put("/teachers/:teacherId/status", updateTeacherTeachingStatus);
router.post("/students/add", addStudent);
router.get("/students/:studentId/edit", getStudentForEdit);
router.put("/students/:studentId/update", updateStudentInfo);
router.put("/students/:studentId/status", updateStudentStatus);
router.put("/students/status/bulk", bulkUpdateStudentStatus);
router.get("/students", getStudentsByFilters);
router.get("/students-info", getStudentsInfo);
router.get("/streams-divisions", getStreamsDivisions);
router.get("/teacher-divisions", getTeacherDivisions);
router.get("/student-divisions", getStudentDivisions);
router.get("/teacher-streams", getTeacherStreams);
router.get("/student-streams", getStudentStreams);

// Analytics routes for clickable stat cards
router.get("/all-students", getAllStudents);
router.get("/all-teachers", getAllTeachers);
router.get("/all-subjects", getAllSubjects);
router.get("/all-divisions", getAllDivisions);
router.get("/current-sessions", getCurrentSessions);

// Real-time updates via Server-Sent Events
router.get("/live-updates", (req, res) => {
  notificationService.addConnection(req.session.user.id, "admin", res, req);
});
router.post("/attendance/update-monthly", updateMonthlyAttendance);

// Search routes
router.get("/search/student/:studentId", searchStudent);
router.get("/search/teacher/:teacherId", searchTeacher);
router.get("/student/:studentId/sessions", getStudentSessionAttendance);

// Teacher management routes
router.get("/teachers/search/:query", searchTeacher);

// Password change route
router.post("/change-password", changeAdminPassword);

export default router;
