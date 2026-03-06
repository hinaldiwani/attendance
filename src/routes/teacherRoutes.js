import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";
import notificationService from "../services/notificationService.js";
import {
  teacherDashboard,
  mappedStudents,
  startAttendance,
  endAttendance,
  manualAttendance,
  teacherActivityLog,
  getStudentsPresent,
  getSubjectSessions,
  saveAttendanceBackup,
  getAttendanceHistory,
  downloadAttendanceBackup,
  viewAttendanceBackup,
  exportAttendanceExcel,
  teacherGetDefaulterList,
  teacherDownloadDefaulterList,
  teacherGetAttendanceDates,
  getStreamsAndDivisions,
  getSubjectsForClass,
  saveDefaulterHistory,
  getDefaulterHistory,
  viewDefaulterHistoryEntry,
  deleteDefaulterHistoryEntry,
  downloadDefaulterHistoryEntry,
  teacherSearchStudent,
} from "../controllers/teacherController.js";
import {
  deleteAttendanceHistory,
  bulkDeleteAttendanceHistory,
} from "../controllers/deleteController.js";

const router = Router();

router.use(requireAuth, requireRole("teacher"));

router.get("/dashboard", teacherDashboard);
router.get("/students", mappedStudents);
router.get("/students/present", getStudentsPresent);
router.get("/subject-sessions", getSubjectSessions);
router.get("/streams", getStreamsAndDivisions);
router.get("/subjects", getSubjectsForClass);
router.post("/attendance/start", startAttendance);
router.post("/attendance/end", endAttendance);
router.post("/attendance/manual", manualAttendance);
router.get("/activity", teacherActivityLog);
router.post("/attendance/backup", saveAttendanceBackup);
router.get("/attendance/history", getAttendanceHistory);
router.post("/attendance/delete-history", deleteAttendanceHistory);
router.post("/attendance/bulk-delete-history", bulkDeleteAttendanceHistory);
router.get("/attendance/backup/:id/view", viewAttendanceBackup);
router.get("/attendance/backup/:id", downloadAttendanceBackup);
router.post("/attendance/export-excel", exportAttendanceExcel);

// Defaulter management routes
router.get("/defaulters", teacherGetDefaulterList);
router.get("/defaulters/download", teacherDownloadDefaulterList);
router.get("/attendance-dates", teacherGetAttendanceDates);

// Defaulter history routes
router.post("/defaulters/history", saveDefaulterHistory);
router.get("/defaulters/history", getDefaulterHistory);
router.get("/defaulters/history/:id", viewDefaulterHistoryEntry);
router.get("/defaulters/history/:id/download", downloadDefaulterHistoryEntry);
router.delete("/defaulters/history/:id", deleteDefaulterHistoryEntry);

// Real-time updates via Server-Sent Events
router.get("/live-updates", (req, res) => {
  notificationService.addConnection(req.session.user.id, "teacher", res, req);
});

// Search route (teachers can only search students)
router.get("/search/student/:studentId", teacherSearchStudent);

export default router;
