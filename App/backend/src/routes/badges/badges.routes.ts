import { Router } from "express";
import { requireAuth } from "@/middleware/auth";
import {
  getAllBadgesForUserController,
  getBadgeDetailController,
  getMyBadgesController,
} from "@/controllers/gamification/badges.controller";

const badgesRoutes = Router();

// Authenticated: list earned badges
badgesRoutes.get("/me", requireAuth, getMyBadgesController);

// Authenticated: list all badges with lock/unlock status + progress
badgesRoutes.get("/all", requireAuth, getAllBadgesForUserController);

// Public: badge detail (optionally indicates if current user has earned)
badgesRoutes.get("/:badgeId", getBadgeDetailController);

export default badgesRoutes;

