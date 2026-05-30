import { Router } from "express";
import { requireAuth } from "@/middleware/auth";
import {
  getLeaderboardController,
  getMyRankController,
} from "@/controllers/gamification/leaderboard.controller";

const leaderboardRoutes = Router();

// Public: leaderboard list. timeframe query param: weekly | monthly | all_time
leaderboardRoutes.get("/", getLeaderboardController);

// Authenticated: get current user's rank for a timeframe
leaderboardRoutes.get("/me", requireAuth, getMyRankController);

export default leaderboardRoutes;

