// src/routes/reports/reports.routes.ts
import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { uploadMemory } from "@/lib/upload.memory";
import { requireAuth } from "@/middleware/auth";
import { optionalAuth } from "@/middleware/optionalAuth";
import {
  createReportController,
  myReportsController,
  publicReportsController,
  claimReportsController,
  similarReportsController,
} from "../../controllers/reports/reports.controller";
import {
  getReportDetailController,
  toggleUpvoteController,
  getCommentsController,
  addCommentController,
  toggleBookmarkController,
} from "../../controllers/reports/interactions.controller";
import { updateReportStatusController } from "../../controllers/reports/status.controller";
import { toggleFollowController } from "../../controllers/reports/followers.controller";

const reportsRoutes = Router();

const uploadReportMedia = (req: Request, res: Response, next: NextFunction) => {
  uploadMemory.single("media")(req, res, (err: any) => {
    if (!err) return next();

    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        error: "Media file too large (max 15MB)",
      });
    }

    return res.status(400).json({
      success: false,
      error: err.message || "Invalid media upload",
    });
  });
};

// ✅ IMPORTANT: Order matters! Specific routes BEFORE :id route

// Create report (anonymous or authenticated)
reportsRoutes.post(
  "/",
  optionalAuth,
  uploadReportMedia,
  createReportController,
);

// List public reports (no auth required, paginated, with optional bounds)
reportsRoutes.get("/public", optionalAuth, publicReportsController);

// Find similar reports nearby (duplicate detection, optional auth for upvote status)
reportsRoutes.get("/similar", optionalAuth, similarReportsController);

// List my reports (auth required) - ✅ Changed from /me to /my
reportsRoutes.get("/my", requireAuth, myReportsController);

// Claim anonymous reports (auth required)
reportsRoutes.post("/claim", requireAuth, claimReportsController);

// ========== Sprint 2: Interactions ==========

// Report detail (optional auth — shows upvote/bookmark status if logged in)
// ✅ This MUST come after specific routes like /public, /my, /claim
reportsRoutes.get("/:id", optionalAuth, getReportDetailController);

// Upvote (auth required)
reportsRoutes.post("/:id/upvote", requireAuth, toggleUpvoteController);

// Comments
reportsRoutes.get("/:id/comments", getCommentsController);
reportsRoutes.post("/:id/comments", requireAuth, addCommentController);

// Bookmark (auth required)
reportsRoutes.post("/:id/bookmark", requireAuth, toggleBookmarkController);

// Follow/unfollow a report (auth required)
reportsRoutes.post("/:id/follow", requireAuth, toggleFollowController);

// Update report status (auth required — ward staff/admin)
reportsRoutes.patch("/:id/status", requireAuth, updateReportStatusController);

export default reportsRoutes;
