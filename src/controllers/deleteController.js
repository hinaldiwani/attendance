import pool from "../../config/db.js";

/**
 * Delete attendance history backup
 * Removes a saved attendance session from the database
 * Only allows deletion of backups that belong to the logged-in teacher
 */
export async function deleteAttendanceHistory(req, res, next) {
  try {
    console.log("🗑️  DELETE ATTENDANCE HISTORY REQUEST");
    console.log("   Request body:", req.body);
    console.log("   Teacher ID:", req.session?.user?.id);
    console.log("   Timestamp:", new Date().toISOString());

    // Get teacher ID from session
    const teacherId = req.session.user.id;

    // Get backup ID from request body
    const { backupId } = req.body;

    // Validate backup ID
    if (!backupId) {
      console.log("   ❌ ERROR: Backup ID is missing");
      return res.status(400).json({
        message: "Backup ID is required",
        success: false,
      });
    }

    console.log("   Attempting to delete backup ID:", backupId);

    // First, verify the backup exists and belongs to this teacher
    const [backups] = await pool.query(
      `SELECT id, filename, subject, saved_at 
       FROM attendance_backup 
       WHERE id = ? AND teacher_id = ?`,
      [backupId, teacherId],
    );

    console.log(
      "   Query result:",
      backups?.length > 0 ? "Found" : "Not found",
    );

    // Check if backup exists
    if (!backups || !Array.isArray(backups) || backups.length === 0) {
      console.log("   ❌ ERROR: Backup not found or unauthorized");
      return res.status(404).json({
        message: "Backup not found or you don't have permission to delete it",
        success: false,
      });
    }

    const backup = backups[0];
    console.log("   Found backup:", {
      id: backup.id,
      filename: backup.filename,
      subject: backup.subject,
    });

    // Delete the backup from database
    const [deleteResult] = await pool.query(
      `DELETE FROM attendance_backup 
       WHERE id = ? AND teacher_id = ?`,
      [backupId, teacherId],
    );

    console.log("   Delete result - Rows affected:", deleteResult.affectedRows);

    // Check if deletion was successful
    if (deleteResult.affectedRows === 0) {
      console.log("   ❌ ERROR: No rows deleted");
      return res.status(500).json({
        message: "Failed to delete backup",
        success: false,
      });
    }

    console.log("   ✅ SUCCESS: Backup deleted successfully");

    // Return success response
    return res.json({
      message: "Attendance history deleted successfully",
      success: true,
      deletedId: backupId,
      deletedFile: backup.filename,
    });
  } catch (error) {
    console.error("   ❌ EXCEPTION in deleteAttendanceHistory:");
    console.error("   Error message:", error.message);
    console.error("   Error stack:", error.stack);
    return next(error);
  }
}

/**
 * Bulk delete multiple attendance history records
 * Allows deleting multiple backups at once
 */
export async function bulkDeleteAttendanceHistory(req, res, next) {
  try {
    console.log("🗑️  BULK DELETE ATTENDANCE HISTORY REQUEST");

    const teacherId = req.session.user.id;
    const { backupIds } = req.body;

    if (!backupIds || !Array.isArray(backupIds) || backupIds.length === 0) {
      return res.status(400).json({
        message: "Backup IDs array is required",
        success: false,
      });
    }

    console.log("   Deleting", backupIds.length, "backups");

    // Create placeholders for the IN clause
    const placeholders = backupIds.map(() => "?").join(",");

    // Delete all specified backups that belong to this teacher
    const [deleteResult] = await pool.query(
      `DELETE FROM attendance_backup 
       WHERE id IN (${placeholders}) AND teacher_id = ?`,
      [...backupIds, teacherId],
    );

    console.log("   Deleted rows:", deleteResult.affectedRows);

    return res.json({
      message: `Successfully deleted ${deleteResult.affectedRows} attendance record(s)`,
      success: true,
      deletedCount: deleteResult.affectedRows,
      requestedCount: backupIds.length,
    });
  } catch (error) {
    console.error(
      "   ❌ EXCEPTION in bulkDeleteAttendanceHistory:",
      error.message,
    );
    return next(error);
  }
}
