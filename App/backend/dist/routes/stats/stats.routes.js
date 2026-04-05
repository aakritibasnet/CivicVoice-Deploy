import { Router } from "express";
import { requireAuth } from "@/middleware/auth";
import { getMyStatsController, getUserStatsPublicController, } from "@/controllers/gamification/stats.controller";
const statsRoutes = Router();
// Authenticated: get own stats
statsRoutes.get("/me", requireAuth, getMyStatsController);
// Public: get stats for another user (public profile stats)
statsRoutes.get("/:userId", getUserStatsPublicController);
export default statsRoutes;
