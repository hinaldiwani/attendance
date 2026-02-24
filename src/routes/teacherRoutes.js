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
  saveAttendanceBackup,
  getAttendanceHistory,
  downloadAttendanceBackup,
  viewAttendanceBackup,
  exportAttendanceExcel,
  teacherGetDefaulterList,
  teacherDownloadDefaulterList,
  getStreamsAndDivisions,
  getSubjectsForClass,
} from "../controllers/teacherController.js";

const router = Router();

router.use(requireAuth, requireRole("teacher"));

router.get("/dashboard", teacherDashboard);
router.get("/students", mappedStudents);
router.get("/streams", getStreamsAndDivisions);
router.get("/subjects", getSubjectsForClass);
router.post("/attendance/start", startAttendance);
router.post("/attendance/end", endAttendance);
router.post("/attendance/manual", manualAttendance);
router.get("/activity", teacherActivityLog);
router.post("/attendance/backup", saveAttendanceBackup);
router.get("/attendance/history", getAttendanceHistory);
router.get("/attendance/backup/:id", downloadAttendanceBackup);
router.get("/attendance/backup/:id/view", viewAttendanceBackup);
router.post("/attendance/export-excel", exportAttendanceExcel);

// Defaulter management routes
router.get("/defaulters", teacherGetDefaulterList);
router.get("/defaulters/download", teacherDownloadDefaulterList);

// Real-time updates via Server-Sent Events
router.get("/live-updates", (req, res) => {
  notificationService.addConnection(req.session.user.id, "teacher", res, req);
});

export default router;
