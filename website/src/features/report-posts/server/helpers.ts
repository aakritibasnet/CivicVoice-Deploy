import { createHash } from "crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import type { GQLUser } from "@/src/graphql/context";
import { assertWorkflowAssignmentForCompletion } from "@/src/lib/reportAssignments";

export type ReportFeedSort = "latest" | "top_rated";

interface LatestCursorPayload {
  sort: "latest";
  created_at: string;
  id: string;
}

interface TopRatedCursorPayload {
  sort: "top_rated";
  rating_average: number;
  rating_count: number;
  created_at: string;
  id: string;
}

export type ReportFeedCursor = LatestCursorPayload | TopRatedCursorPayload;

export interface TaskSnapshotSource {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  submitted_at: Date;
  ward_id: string | null;
  ward_name: string | null;
  media_url: string | null;
  photo_urls: unknown;
  citizen_name: string | null;
}

export interface CompletionSnapshotInput {
  description: string | null;
  before_image_url: string | null;
  after_image_url: string;
  completed_at: Date;
  completed_by_name: string;
  completed_by_role: string;
}

export function isCitizenRole(role?: string | null) {
  return role === "citizen";
}

export function isManagerRole(role?: string | null) {
  return role === "ward" || role === "municipality" || role === "admin" || role === "officer";
}

export function canComment(role?: string | null) {
  return Boolean(role);
}

export function canRate(role?: string | null) {
  return isCitizenRole(role);
}

export function canBookmark(role?: string | null) {
  return isCitizenRole(role);
}

export function canReportComment(role?: string | null) {
  return isCitizenRole(role);
}

export function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

export function getBeforeImage(task: { media_url: string | null; photo_urls: unknown }) {
  if (task.media_url) {
    return task.media_url;
  }

  return getStringArray(task.photo_urls)[0] ?? null;
}

export function getAnonymousDisplayName(postId: string, userId: string) {
  const digest = createHash("sha256")
    .update(`${postId}:${userId}`)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();

  return `Resident ${digest}`;
}

export function encodeFeedCursor(cursor: ReportFeedCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeFeedCursor(cursor?: string | null): ReportFeedCursor | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as ReportFeedCursor;

    if (!parsed || typeof parsed !== "object" || typeof parsed.id !== "string") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function buildLatestCursorWhere(cursor: ReportFeedCursor | null): Prisma.report_postsWhereInput | undefined {
  if (!cursor || cursor.sort !== "latest") {
    return undefined;
  }

  const createdAt = new Date(cursor.created_at);

  return {
    OR: [
      { created_at: { lt: createdAt } },
      {
        AND: [
          { created_at: createdAt },
          { id: { lt: cursor.id } },
        ],
      },
    ],
  };
}

export function buildTopRatedCursorWhere(cursor: ReportFeedCursor | null): Prisma.report_postsWhereInput | undefined {
  if (!cursor || cursor.sort !== "top_rated") {
    return undefined;
  }

  const createdAt = new Date(cursor.created_at);

  return {
    OR: [
      { rating_average: { lt: cursor.rating_average } },
      {
        AND: [
          { rating_average: cursor.rating_average },
          { rating_count: { lt: cursor.rating_count } },
        ],
      },
      {
        AND: [
          { rating_average: cursor.rating_average },
          { rating_count: cursor.rating_count },
          { created_at: { lt: createdAt } },
        ],
      },
      {
        AND: [
          { rating_average: cursor.rating_average },
          { rating_count: cursor.rating_count },
          { created_at: createdAt },
          { id: { lt: cursor.id } },
        ],
      },
    ],
  };
}

export function buildTaskSnapshot(task: TaskSnapshotSource) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    category: task.category,
    priority: task.priority,
    status: task.status,
    submitted_at: task.submitted_at.toISOString(),
    ward_id: task.ward_id,
    ward_name: task.ward_name,
    citizen_name: task.citizen_name,
    before_image_url: getBeforeImage(task),
    photo_urls: getStringArray(task.photo_urls),
  };
}

export function buildCompletionSnapshot(input: CompletionSnapshotInput) {
  return {
    description: input.description,
    before_image_url: input.before_image_url,
    after_image_url: input.after_image_url,
    completed_at: input.completed_at.toISOString(),
    completed_by_name: input.completed_by_name,
    completed_by_role: input.completed_by_role,
  };
}

export function assertAuthenticated(user: GQLUser | null) {
  if (!user) {
    throw new Error("Not authenticated");
  }

  return user;
}

export function assertCanCompleteTask(
  user: GQLUser,
  task: {
    ward_id: string | null;
    assigned_level: string;
    assigned_officer_id: string | null;
    assigned_department_id?: string | null;
    assigned_field_officer_id?: string | null;
  },
) {
  if (!isManagerRole(user.role)) {
    throw new Error("Only officers or administrators can complete tasks");
  }

  assertWorkflowAssignmentForCompletion(task);

  if (user.role === "ward" && task.assigned_level !== "ward") {
    throw new Error("This task is not assigned to the ward workflow");
  }

  if (user.role === "municipality" && task.assigned_level !== "municipality") {
    throw new Error("This task is not assigned to the municipality workflow");
  }

  if (user.role === "ward" && user.wardId && task.ward_id && task.ward_id !== user.wardId) {
    throw new Error("You can only complete tasks in your ward");
  }

  if (user.role === "officer" && task.assigned_officer_id && task.assigned_officer_id !== user.id) {
    throw new Error("You can only complete tasks assigned to you");
  }
}

export function assertCanEditPost(
  user: GQLUser,
  task: { ward_id: string | null; assigned_level: string; assigned_officer_id: string | null },
) {
  if (!isManagerRole(user.role)) {
    throw new Error("Only officers or administrators can edit report posts");
  }

  if (user.role === "admin") {
    return;
  }

  if (user.role === "ward") {
    if (task.assigned_level !== "ward") {
      throw new Error("This post belongs to the municipality workflow");
    }

    if (user.wardId && task.ward_id && task.ward_id !== user.wardId) {
      throw new Error("You can only edit posts for your ward");
    }

    return;
  }

  if (user.role === "municipality" && task.assigned_level !== "municipality") {
    throw new Error("This post belongs to the ward workflow");
  }

  if (user.role === "officer" && task.assigned_officer_id && task.assigned_officer_id !== user.id) {
    throw new Error("You can only edit posts for tasks assigned to you");
  }
}
