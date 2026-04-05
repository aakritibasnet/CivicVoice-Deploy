import { Request, Response } from "express";
import { pool } from "@/db/pool";
import type { ApiResponse } from "@/types/api.types";
import { notifyStatusChange } from "@/services/notifications/triggers.service";

const VALID_STATUSES = [
  "submitted",
  "under_review",
  "in_progress",
  "resolved",
  "closed",
];

export async function updateReportStatusController(
  req: Request,
  res: Response,
) {
  try {
    const reportId = req.params.id;
    const { status, notes } = req.body;
    const userId = req.user?.id;

    if (!reportId || typeof reportId !== "string" || !reportId.trim()) {
      return res.status(400).json({
        success: false,
        error: "Invalid report ID",
      } satisfies ApiResponse);
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      } satisfies ApiResponse);
    }

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
      } satisfies ApiResponse);
    }

    // Get current status
    const { rows: reportRows } = await pool.query<{
      status: string;
    }>(`SELECT status FROM reports WHERE id = $1`, [reportId]);

    if (!reportRows.length) {
      return res.status(404).json({
        success: false,
        error: "Report not found",
      } satisfies ApiResponse);
    }

    const oldStatus = reportRows[0].status;

    if (oldStatus === status) {
      return res.json({
        success: true,
        data: { message: "Status unchanged", status },
      } satisfies ApiResponse);
    }

    // Update report status
    await pool.query(`UPDATE reports SET status = $1 WHERE id = $2`, [
      status,
      reportId,
    ]);

    // Insert into status_history for audit trail
    await pool.query(
      `INSERT INTO status_history (report_id, old_status, new_status, changed_by, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [reportId, oldStatus, status, userId, notes || null],
    );

    // Fire notification to report owner + followers
    try {
      await notifyStatusChange(reportId, status);
    } catch (err) {
      console.error("notifyStatusChange error:", err);
    }

    return res.json({
      success: true,
      data: {
        report_id: reportId,
        old_status: oldStatus,
        new_status: status,
      },
    } satisfies ApiResponse);
  } catch (err: any) {
    console.error("updateReportStatusController error:", err);
    return res.status(500).json({
      success: false,
      error: "Server error",
    } satisfies ApiResponse);
  }
}
