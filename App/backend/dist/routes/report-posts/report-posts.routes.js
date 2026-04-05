import { Router } from "express";
import { requireAuth } from "@/middleware/auth";
import { optionalAuth } from "@/middleware/optionalAuth";
import { feedController, detailController, rateController, bookmarkController, bookmarkedPostsController, commentsController, addCommentController, } from "@/controllers/report-posts/feed.controller";
const router = Router();
// Public (optionalAuth to get viewer state if logged in)
router.get("/feed", optionalAuth, feedController);
router.get("/bookmarked", requireAuth, bookmarkedPostsController);
router.get("/:id", optionalAuth, detailController);
router.get("/:id/comments", commentsController);
// Authenticated
router.post("/:id/rate", requireAuth, rateController);
router.post("/:id/bookmark", requireAuth, bookmarkController);
router.post("/:id/comments", requireAuth, addCommentController);
export default router;
