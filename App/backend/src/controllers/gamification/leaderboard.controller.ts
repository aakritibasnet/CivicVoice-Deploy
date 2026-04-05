// src/controllers/gamification/leaderboard.controller.ts
import type { Request, Response, NextFunction } from "express";
import type { ApiResponse } from "@/types/api.types";
import {
  getLeaderboard,
  getUserRank,
} from "@/services/gamification/leaderboard.service";

type Timeframe = "weekly" | "monthly" | "all_time";

function parseTimeframe(raw: string | undefined): Timeframe {
  if (raw === "weekly" || raw === "monthly" || raw === "all_time") return raw;
  return "weekly";
}

export async function getLeaderboardController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const timeframe = parseTimeframe(req.query.timeframe as string | undefined);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt((req.query.limit as string) || "10", 10)),
    );
    const page = Math.max(
      1,
      Number.parseInt((req.query.page as string) || "1", 10),
    );
    const offset = (page - 1) * limit;

    const { rows, total_users } = await getLeaderboard(
      timeframe,
      limit,
      offset,
    );

    return res.json({
      success: true,
      data: {
        timeframe,
        leaderboard: rows,
        pagination: {
          currentPage: page,
          totalCount: total_users,
          totalPages: total_users > 0 ? Math.ceil(total_users / limit) : 0,
          hasNext: total_users > page * limit,
          hasPrev: page > 1,
        },
      },
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}

export async function getMyRankController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user?.id; // ✅ Keep as string

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      } satisfies ApiResponse);
    }

    const timeframe = parseTimeframe(req.query.timeframe as string | undefined);
    const rankRow = await getUserRank(timeframe, userId);

    return res.json({
      success: true,
      data: {
        timeframe,
        rank: rankRow,
      },
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}
