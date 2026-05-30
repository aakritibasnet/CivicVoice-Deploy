import { Prisma } from "@/app/generated/prisma/client";
import type { GQLContext, GQLUser } from "@/src/graphql/context";
import { createNotification } from "@/src/graphql/resolvers/notification.resolver";
import { getLatestReopenEntry } from "@/src/lib/reportWorkflow";
import {
  createWorkflowHistoryEntry,
  findWorkflowColumn,
  mergeWorkflowHistory,
} from "@/src/lib/reportWorkflowServer";
import {
  assertAuthenticated,
  assertCanCompleteTask,
  assertCanEditPost,
  buildCompletionSnapshot,
  buildLatestCursorWhere,
  buildTaskSnapshot,
  buildTopRatedCursorWhere,
  canBookmark,
  canComment,
  canRate,
  canReportComment,
  decodeFeedCursor,
  encodeFeedCursor,
  getAnonymousDisplayName,
  getBeforeImage,
  getStringArray,
  normalizeOptionalText,
  type ReportFeedSort,
} from "./helpers";

const FEED_LIMIT_MAX = 24;
const REPORT_SORT_MAX = 24;

type TaskReportFeedSort = "recent" | "most_upvoted";

interface RecentTaskCursorPayload {
  sort: "recent";
  updated_at: string;
  id: string;
}

interface MostUpvotedTaskCursorPayload {
  sort: "most_upvoted";
  upvote_count: number;
  updated_at: string;
  id: string;
}

type TaskReportCursor =
  | RecentTaskCursorPayload
  | MostUpvotedTaskCursorPayload;

const taskCompletionInclude = {
  wards: {
    select: {
      id: true,
      name: true,
      ward_code: true,
    },
  },
  users_reports_user_idTousers: {
    select: {
      id: true,
      name: true,
    },
  },
  users_reports_assigned_officer_idTousers: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  task_completion: true,
  report_post: true,
} as const;

const reportPostBaseInclude = {
  wards: {
    select: {
      id: true,
      name: true,
      ward_code: true,
    },
  },
  reports: {
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      priority: true,
      status: true,
      submitted_at: true,
      ward_id: true,
      media_url: true,
      photo_urls: true,
      citizen_name: true,
      assigned_level: true,
      assigned_officer_id: true,
      status_history: true,
      wards: {
        select: {
          id: true,
          name: true,
          ward_code: true,
        },
      },
    },
  },
  task_completions: {
    include: {
      completed_by_user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          ward_id: true,
        },
      },
      completed_by_officer: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          type: true,
          ward_id: true,
        },
      },
    },
  },
} as const;

const reportCommentInclude = {
  users: {
    select: {
      id: true,
      role: true,
      ward_id: true,
    },
  },
} as const;

type ReportPostRecord = Prisma.report_postsGetPayload<{
  include: typeof reportPostBaseInclude;
}>;

type ReportCommentRecord = Prisma.report_commentsGetPayload<{
  include: typeof reportCommentInclude;
}>;

type TaskReportRecord = Prisma.reportsGetPayload<{
  include: {
    wards: {
      select: {
        id: true;
        name: true;
        ward_code: true;
      };
    };
  };
}>;

interface ViewerState {
  isBookmarked: boolean;
  viewerRating: number | null;
}

type RatingsStore = Pick<GQLContext["prisma"], "report_ratings" | "report_posts">;
type WardCodeLookup = Map<string, string>;

interface CommentNode {
  id: string;
  post_id: string;
  parent_id: string | null;
  content: string;
  anonymous_name: string;
  display_name: string;
  author_role: string;
  is_official: boolean;
  reply_count: number;
  created_at: Date;
  updated_at: Date;
  viewer_can_report: boolean;
  viewer_can_reply: boolean;
  replies: CommentNode[];
}

function clampFeedLimit(limit?: number | null) {
  if (!limit || limit < 1) {
    return 12;
  }

  return Math.min(limit, FEED_LIMIT_MAX);
}

function clampTaskFeedLimit(limit?: number | null) {
  if (!limit || limit < 1) {
    return 12;
  }

  return Math.min(limit, REPORT_SORT_MAX);
}

function encodeTaskReportCursor(cursor: TaskReportCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeTaskReportCursor(cursor?: string | null): TaskReportCursor | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as TaskReportCursor;

    if (!parsed || typeof parsed !== "object" || typeof parsed.id !== "string") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function buildRecentTaskCursorWhere(cursor: TaskReportCursor | null) {
  if (!cursor || cursor.sort !== "recent") {
    return undefined;
  }

  const updatedAt = new Date(cursor.updated_at);

  return {
    OR: [
      { updated_at: { lt: updatedAt } },
      {
        AND: [{ updated_at: updatedAt }, { id: { lt: cursor.id } }],
      },
    ],
  } satisfies Prisma.reportsWhereInput;
}

function buildMostUpvotedTaskCursorWhere(cursor: TaskReportCursor | null) {
  if (!cursor || cursor.sort !== "most_upvoted") {
    return undefined;
  }

  const updatedAt = new Date(cursor.updated_at);

  return {
    OR: [
      { upvote_count: { lt: cursor.upvote_count } },
      {
        AND: [
          { upvote_count: cursor.upvote_count },
          { updated_at: { lt: updatedAt } },
        ],
      },
      {
        AND: [
          { upvote_count: cursor.upvote_count },
          { updated_at: updatedAt },
          { id: { lt: cursor.id } },
        ],
      },
    ],
  } satisfies Prisma.reportsWhereInput;
}

function getCompletionActorName(
  task: {
    users_reports_assigned_officer_idTousers: {
      name: string;
    } | null;
  },
  userRecord: { name: string },
) {
  return task.users_reports_assigned_officer_idTousers?.name ?? userRecord.name;
}

function getCompletionActorRole(user: GQLUser) {
  if (user.role === "ward" || user.role === "officer") {
    return "ward_officer";
  }

  if (user.role === "municipality") {
    return "dashboard_manager";
  }

  return user.role;
}

function buildViewerStateMap(
  ratings: Array<{ post_id: string; rating: number }>,
  bookmarks: Array<{ post_id: string }>,
) {
  const ratingMap = new Map<string, number>();
  const bookmarkSet = new Set<string>();

  for (const rating of ratings) {
    ratingMap.set(rating.post_id, rating.rating);
  }

  for (const bookmark of bookmarks) {
    bookmarkSet.add(bookmark.post_id);
  }

  return { ratingMap, bookmarkSet };
}

async function fetchViewerState(
  prisma: GQLContext["prisma"],
  userId: string | null,
  postIds: string[],
) {
  if (!userId || postIds.length === 0) {
    return buildViewerStateMap([], []);
  }

  const [ratings, bookmarks] = await Promise.all([
    prisma.report_ratings.findMany({
      where: {
        user_id: userId,
        post_id: { in: postIds },
      },
      select: {
        post_id: true,
        rating: true,
      },
    }),
    prisma.report_post_bookmarks.findMany({
      where: {
        user_id: userId,
        post_id: { in: postIds },
      },
      select: {
        post_id: true,
      },
    }),
  ]);

  return buildViewerStateMap(ratings, bookmarks);
}

function canEditPostForViewer(user: GQLUser | null, task: ReportPostRecord["reports"]) {
  if (!user) {
    return false;
  }

  try {
    assertCanEditPost(user, {
      ward_id: task.ward_id,
      assigned_level: task.assigned_level,
      assigned_officer_id: task.assigned_officer_id,
    });
    return true;
  } catch {
    return false;
  }
}

function getReopenedByLabel(
  actorRole: string,
  wardCode: string | null | undefined,
  workflowLevel: string | null | undefined,
) {
  if (actorRole === "ward") {
    return wardCode ? `${wardCode} Office` : "Ward Office";
  }

  if (actorRole === "officer") {
    if (workflowLevel === "ward") {
      return wardCode ? `${wardCode} Office` : "Ward Office";
    }

    return "Municipality Office";
  }

  if (actorRole === "municipality") {
    return "Municipality Office";
  }

  if (actorRole === "admin") {
    return "Administration Office";
  }

  return null;
}

function mapReportPost(record: ReportPostRecord, user: GQLUser | null, viewerState: ViewerState) {
  const task = record.reports;
  const completion = record.task_completions;
  const latestReopenEntry = getLatestReopenEntry(task.status_history, {
    after: record.completed_at,
  });
  const reopenedByName = latestReopenEntry
    ? getReopenedByLabel(
        latestReopenEntry.actor_role,
        task.wards?.ward_code ?? record.wards?.ward_code ?? null,
        latestReopenEntry.to_level ?? task.assigned_level,
      )
    : null;

  return {
    id: record.id,
    task_id: record.task_id,
    completion_id: record.completion_id,
    title: record.title,
    description: record.description,
    category: record.category,
    priority: record.priority,
    ward_name: record.ward_name_snapshot,
    completed_by_name: record.completed_by_name_snapshot,
    completed_by_role: record.completed_by_role_snapshot,
    before_image_url: record.before_image_url,
    after_image_url: record.after_image_url,
    rating_average: record.rating_average,
    rating_count: record.rating_count,
    comment_count: record.comment_count,
    bookmark_count: record.bookmark_count,
    edited_count: record.edited_count,
    created_at: record.created_at,
    updated_at: record.updated_at,
    completed_at: record.completed_at,
    is_reopened: Boolean(latestReopenEntry),
    reopened_at: latestReopenEntry?.at ?? null,
    reopened_reason: latestReopenEntry?.note ?? null,
    reopened_by_name: reopenedByName,
    reopened_status:
      latestReopenEntry?.to_status === "incoming" ||
      latestReopenEntry?.to_status === "in_progress" ||
      latestReopenEntry?.to_status === "completed" ||
      latestReopenEntry?.to_status === "returned" ||
      latestReopenEntry?.to_status === "invalid"
        ? latestReopenEntry.to_status
        : null,
    viewer_rating: viewerState.viewerRating,
    is_bookmarked: viewerState.isBookmarked,
    viewer_can_rate: canRate(user?.role),
    viewer_can_comment: canComment(user?.role),
    viewer_can_bookmark: canBookmark(user?.role),
    viewer_can_edit: canEditPostForViewer(user, task),
    ward: record.wards
      ? {
          id: record.wards.id,
          name: record.wards.name,
          ward_code: record.wards.ward_code,
        }
      : null,
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      category: task.category,
      priority: task.priority,
      status: task.status,
      submitted_at: task.submitted_at,
      before_image_url: getBeforeImage(task),
      ward: task.wards
        ? {
            id: task.wards.id,
            name: task.wards.name,
            ward_code: task.wards.ward_code,
          }
        : null,
    },
    completion: {
      id: completion.id,
      task_id: completion.task_id,
      description: completion.description,
      before_image_url: completion.before_image_url,
      after_image_url: completion.after_image_url,
      completed_at: completion.completed_at,
      completed_by_name: record.completed_by_name_snapshot,
      completed_by_role: record.completed_by_role_snapshot,
    },
  };
}

function mapComment(
  record: ReportCommentRecord,
  user: GQLUser | null,
  replies: CommentNode[] = [],
  wardCodes: WardCodeLookup = new Map(),
): CommentNode {
  const authorRole = record.users.role;
  const wardCode = record.users.ward_id
    ? wardCodes.get(record.users.ward_id)?.trim()
    : null;
  const isOfficial =
    authorRole === "ward" ||
    authorRole === "municipality" ||
    authorRole === "admin" ||
    authorRole === "officer";
  const displayName = isOfficial
    ? getOfficeCommentLabel(authorRole, wardCode, record.users.ward_id)
    : record.anonymous_name;

  return {
    id: record.id,
    post_id: record.post_id,
    parent_id: record.parent_id,
    content: record.content,
    anonymous_name: record.anonymous_name,
    display_name: displayName,
    author_role: authorRole,
    is_official: isOfficial,
    reply_count: record.reply_count,
    created_at: record.created_at,
    updated_at: record.updated_at,
    viewer_can_report: canReportComment(user?.role) && user?.id !== record.user_id,
    viewer_can_reply: canComment(user?.role),
    replies,
  };
}

function getOfficeCommentLabel(
  role: string,
  wardCode: string | null | undefined,
  wardId: string | null | undefined,
) {
  if (role === "ward") {
    return wardCode ? `${wardCode} Office` : "Ward Office";
  }

  if (role === "officer") {
    if (wardCode || wardId) {
      return wardCode ? `${wardCode} Office` : "Ward Office";
    }

    return "Municipality Office";
  }

  if (role === "admin") {
    return "Administration Office";
  }

  if (role === "municipality") {
    return "Municipality Office";
  }

  return "Office";
}

async function recalculatePostRatings(
  tx: RatingsStore,
  postId: string,
) {
  const aggregate = await tx.report_ratings.aggregate({
    where: { post_id: postId },
    _count: { _all: true },
    _avg: { rating: true },
  });

  const ratingCount = aggregate._count._all;
  const ratingAverage = aggregate._avg.rating ?? 0;

  await tx.report_posts.update({
    where: { id: postId },
    data: {
      rating_count: ratingCount,
      rating_average: ratingAverage,
      updated_at: new Date(),
    },
  });

  return { rating_count: ratingCount, rating_average: ratingAverage };
}

async function getCurrentUserRecord(
  prisma: GQLContext["prisma"],
  userId: string,
) {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      ward_id: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  return user;
}

async function buildWardCodeLookup(
  prisma: GQLContext["prisma"],
  comments: ReportCommentRecord[],
) {
  const wardIds = [...new Set(
    comments
      .map((comment) => comment.users.ward_id)
      .filter((wardId): wardId is string => typeof wardId === "string" && wardId.length > 0),
  )];

  if (wardIds.length === 0) {
    return new Map<string, string>();
  }

  const wards = await prisma.wards.findMany({
    where: { id: { in: wardIds } },
    select: {
      id: true,
      ward_code: true,
    },
  });

  return new Map(wards.map((ward) => [ward.id, ward.ward_code]));
}

async function getScopedWards(
  prisma: GQLContext["prisma"],
  user: GQLUser | null,
) {
  if (user?.role === "municipality") {
    const viewer = await prisma.users.findUnique({
      where: { id: user.id },
      select: { municipality_id: true },
    });

    if (!viewer?.municipality_id) {
      return [] as Array<{ id: string; name: string; ward_code: string }>;
    }

    return prisma.wards.findMany({
      where: {
        is_active: true,
        municipality_id: viewer.municipality_id,
      },
      orderBy: [{ ward_code: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        ward_code: true,
      },
    });
  }

  return prisma.wards.findMany({
    where: { is_active: true },
    orderBy: [{ ward_code: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      ward_code: true,
    },
  });
}

async function resolveWardScope(
  prisma: GQLContext["prisma"],
  user: GQLUser | null,
  wardId?: string | null,
) {
  const scopedWards = await getScopedWards(prisma, user);
  const scopedWardIds = new Set(scopedWards.map((ward) => ward.id));

  if (wardId) {
    if (user?.role === "municipality" && !scopedWardIds.has(wardId)) {
      return {
        wards: scopedWards,
        where: {
          id: { in: [] },
        } satisfies Prisma.wardsWhereInput,
        reportWhere: {
          ward_id: { in: [] },
        } satisfies Prisma.reportsWhereInput,
        postWhere: {
          ward_id: { in: [] },
        } satisfies Prisma.report_postsWhereInput,
      };
    }

    return {
      wards: scopedWards,
      where: { id: wardId } satisfies Prisma.wardsWhereInput,
      reportWhere: { ward_id: wardId } satisfies Prisma.reportsWhereInput,
      postWhere: { ward_id: wardId } satisfies Prisma.report_postsWhereInput,
    };
  }

  if (user?.role === "municipality") {
    const allowedIds = scopedWards.map((ward) => ward.id);

    return {
      wards: scopedWards,
      where: { id: { in: allowedIds } } satisfies Prisma.wardsWhereInput,
      reportWhere: { ward_id: { in: allowedIds } } satisfies Prisma.reportsWhereInput,
      postWhere: { ward_id: { in: allowedIds } } satisfies Prisma.report_postsWhereInput,
    };
  }

  return {
    wards: scopedWards,
    where: undefined,
    reportWhere: undefined,
    postWhere: undefined,
  };
}

function mapTaskReport(record: TaskReportRecord) {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    category: record.category,
    priority: record.priority,
    status: record.status,
    upvote_count: record.upvote_count,
    comment_count: record.comment_count,
    media_url: record.media_url,
    photo_urls: getStringArray(record.photo_urls),
    address_text: record.address_text,
    submitted_at: record.submitted_at,
    created_at: record.created_at,
    updated_at: record.updated_at,
    ward_id: record.ward_id,
    assigned_level: record.assigned_level,
    escalated_to_municipality: record.escalated_to_municipality,
    escalated_at: record.escalated_at,
    escalation_type: record.escalation_type,
    returned_to_ward_at: record.returned_to_ward_at,
    pathway_reason: record.pathway_reason,
    return_reasoning: record.return_reasoning,
    return_instructions: record.return_instructions,
    ward: record.wards
      ? {
          id: record.wards.id,
          name: record.wards.name,
          ward_code: record.wards.ward_code,
        }
      : null,
  };
}

export async function getReportFeed(
  prisma: GQLContext["prisma"],
  user: GQLUser | null,
  args: {
    wardId?: string | null;
    category?: string | null;
    cursor?: string | null;
    limit?: number | null;
    sort?: ReportFeedSort | null;
  },
) {
  const limit = clampFeedLimit(args.limit);
  const sort = args.sort ?? "latest";
  const cursor = decodeFeedCursor(args.cursor);
  const wardScope = await resolveWardScope(prisma, user, args.wardId);

  const cursorWhere =
    sort === "top_rated"
      ? buildTopRatedCursorWhere(cursor)
      : buildLatestCursorWhere(cursor);

  const andWhere: Prisma.report_postsWhereInput[] = [];

  if (wardScope.postWhere) {
    andWhere.push(wardScope.postWhere);
  }

  if (args.category) {
    andWhere.push({ category: args.category });
  }

  if (cursorWhere) {
    andWhere.push(cursorWhere);
  }

  const where: Prisma.report_postsWhereInput =
    andWhere.length > 0 ? { AND: andWhere } : {};

  const orderBy: Prisma.report_postsOrderByWithRelationInput[] =
    sort === "top_rated"
      ? [
          { rating_average: "desc" },
          { rating_count: "desc" },
          { created_at: "desc" },
          { id: "desc" },
        ]
      : [{ created_at: "desc" }, { id: "desc" }];

  const records = await prisma.report_posts.findMany({
    where,
    orderBy,
    take: limit + 1,
    include: reportPostBaseInclude,
  });

  const hasMore = records.length > limit;
  const pageRecords = hasMore ? records.slice(0, -1) : records;
  const postIds = pageRecords.map((record) => record.id);
  const { ratingMap, bookmarkSet } = await fetchViewerState(
    prisma,
    user?.id ?? null,
    postIds,
  );

  const nodes = pageRecords.map((record) =>
    mapReportPost(record, user, {
      viewerRating: ratingMap.get(record.id) ?? null,
      isBookmarked: bookmarkSet.has(record.id),
    }),
  );

  const lastRecord = pageRecords.at(-1);
  const endCursor = lastRecord
    ? encodeFeedCursor(
        sort === "top_rated"
          ? {
              sort,
              id: lastRecord.id,
              rating_average: lastRecord.rating_average,
              rating_count: lastRecord.rating_count,
              created_at: lastRecord.created_at.toISOString(),
            }
          : {
              sort,
              id: lastRecord.id,
              created_at: lastRecord.created_at.toISOString(),
            },
      )
    : null;

  return {
    nodes,
    pageInfo: {
      endCursor,
      hasMore,
    },
  };
}

export async function getReportFeedScope(
  prisma: GQLContext["prisma"],
  user: GQLUser | null,
) {
  const wardScope = await resolveWardScope(prisma, user, null);

  const categories = await prisma.reports.findMany({
    where: {
      is_public: true,
      ...(wardScope.reportWhere ?? {}),
    },
    distinct: ["category"],
    orderBy: { category: "asc" },
    select: { category: true },
  });

  return {
    wards: wardScope.wards,
    categories: categories
      .map((entry) => entry.category)
      .filter((category): category is string => Boolean(category)),
    defaultWardId: user?.role === "ward" ? user.wardId ?? null : null,
    wardScopeLabel:
      user?.role === "municipality" ? "All wards in municipality" : "All wards",
  };
}

export async function getTaskReportFeed(
  prisma: GQLContext["prisma"],
  user: GQLUser | null,
  args: {
    wardId?: string | null;
    category?: string | null;
    cursor?: string | null;
    limit?: number | null;
    sort?: TaskReportFeedSort | null;
    statuses?: Array<
      "incoming" | "in_progress" | "completed" | "returned" | "invalid"
    > | null;
    escalated?: boolean | null;
  },
) {
  const limit = clampTaskFeedLimit(args.limit);
  const sort = args.sort ?? "recent";
  const cursor = decodeTaskReportCursor(args.cursor);
  const wardScope = await resolveWardScope(prisma, user, args.wardId);

  const cursorWhere =
    sort === "most_upvoted"
      ? buildMostUpvotedTaskCursorWhere(cursor)
      : buildRecentTaskCursorWhere(cursor);

  const andWhere: Prisma.reportsWhereInput[] = [{ is_public: true }];

  if (wardScope.reportWhere) {
    andWhere.push(wardScope.reportWhere);
  }

  if (args.category) {
    andWhere.push({ category: args.category });
  }

  if (args.statuses && args.statuses.length > 0) {
    andWhere.push({ status: { in: args.statuses } });
  }

  if (typeof args.escalated === "boolean") {
    andWhere.push({ escalated_to_municipality: args.escalated });
  }

  if (cursorWhere) {
    andWhere.push(cursorWhere);
  }

  const where: Prisma.reportsWhereInput =
    andWhere.length > 0 ? { AND: andWhere } : {};

  const orderBy: Prisma.reportsOrderByWithRelationInput[] =
    sort === "most_upvoted"
      ? [{ upvote_count: "desc" }, { updated_at: "desc" }, { id: "desc" }]
      : [{ updated_at: "desc" }, { id: "desc" }];

  const records = await prisma.reports.findMany({
    where,
    orderBy,
    take: limit + 1,
    include: {
      wards: {
        select: {
          id: true,
          name: true,
          ward_code: true,
        },
      },
    },
  });

  const hasMore = records.length > limit;
  const pageRecords = hasMore ? records.slice(0, -1) : records;
  const lastRecord = pageRecords.at(-1);
  const endCursor = lastRecord
    ? encodeTaskReportCursor(
        sort === "most_upvoted"
          ? {
              sort,
              id: lastRecord.id,
              upvote_count: lastRecord.upvote_count,
              updated_at: lastRecord.updated_at.toISOString(),
            }
          : {
              sort,
              id: lastRecord.id,
              updated_at: lastRecord.updated_at.toISOString(),
            },
      )
    : null;

  return {
    nodes: pageRecords.map(mapTaskReport),
    pageInfo: {
      endCursor,
      hasMore,
    },
  };
}

export async function getPublicTaskReport(
  prisma: GQLContext["prisma"],
  reportId: string,
) {
  const record = await prisma.reports.findFirst({
    where: {
      id: reportId,
      is_public: true,
    },
    include: {
      wards: {
        select: {
          id: true,
          name: true,
          ward_code: true,
        },
      },
    },
  });

  if (!record) {
    return null;
  }

  return mapTaskReport(record);
}

export async function getReportPost(
  prisma: GQLContext["prisma"],
  user: GQLUser | null,
  postId: string,
) {
  const record = await prisma.report_posts.findUnique({
    where: { id: postId },
    include: reportPostBaseInclude,
  });

  if (!record) {
    return null;
  }

  const { ratingMap, bookmarkSet } = await fetchViewerState(
    prisma,
    user?.id ?? null,
    [postId],
  );

  return mapReportPost(record, user, {
    viewerRating: ratingMap.get(postId) ?? null,
    isBookmarked: bookmarkSet.has(postId),
  });
}

export async function getComments(
  prisma: GQLContext["prisma"],
  user: GQLUser | null,
  postId: string,
) {
  const comments = await prisma.report_comments.findMany({
    where: { post_id: postId },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    include: reportCommentInclude,
  });
  const wardCodes = await buildWardCodeLookup(prisma, comments);

  const byParent = new Map<string | null, ReportCommentRecord[]>();

  for (const comment of comments) {
    const key = comment.parent_id;
    const bucket = byParent.get(key) ?? [];
    bucket.push(comment);
    byParent.set(key, bucket);
  }

  const buildTree = (parentId: string | null): ReturnType<typeof mapComment>[] =>
    (byParent.get(parentId) ?? []).map((comment) =>
      mapComment(comment, user, buildTree(comment.id), wardCodes),
    );

  return buildTree(null);
}

export async function completeTask(
  prisma: GQLContext["prisma"],
  user: GQLUser | null,
  args: {
    taskId: string;
    afterImage: string;
    description?: string | null;
  },
) {
  const authed = assertAuthenticated(user);
  const afterImage = args.afterImage.trim();

  if (!afterImage) {
    throw new Error("A completion image is required");
  }

  const task = await prisma.reports.findUnique({
    where: { id: args.taskId },
    include: taskCompletionInclude,
  });

  if (!task) {
    throw new Error("Task not found");
  }

  assertCanCompleteTask(authed, {
    ward_id: task.ward_id,
    assigned_level: task.assigned_level,
    assigned_officer_id: task.assigned_officer_id,
    assigned_department_id: task.assigned_department_id,
    assigned_field_officer_id: task.assigned_field_officer_id,
  });

  const currentUser = await getCurrentUserRecord(prisma, authed.id);
  const completionDescription =
    normalizeOptionalText(args.description) ??
    normalizeOptionalText(task.description) ??
    "Task completed";
  const beforeImage = getBeforeImage(task);
  const completedAt = new Date();
  const completedByName = getCompletionActorName(task, currentUser);
  const completedByRole = getCompletionActorRole(authed);
  const workflowOwner = task.assigned_level === "municipality" ? "municipality" : "ward";
  const completedColumn = await findWorkflowColumn(prisma, workflowOwner, "completed");

  if (!completedColumn) {
    throw new Error(`No completed column configured for ${workflowOwner}`);
  }

  const updatedPostId = await prisma.$transaction(async (tx) => {
    const completion = await tx.task_completions.upsert({
      where: { task_id: task.id },
      create: {
        task_id: task.id,
        completed_by_user_id: currentUser.id,
        description: completionDescription,
        before_image_url: beforeImage,
        after_image_url: afterImage,
        completed_at: completedAt,
      },
      update: {
        completed_by_user_id: currentUser.id,
        description: completionDescription,
        before_image_url: beforeImage,
        after_image_url: afterImage,
        completed_at: completedAt,
        updated_at: new Date(),
      },
    });

    await tx.reports.update({
      where: { id: task.id },
      data: {
        status: "completed",
        kanban_column_id: completedColumn.id,
        ...(task.assigned_level === "ward" &&
          !task.incoming_seen_at && {
            incoming_seen_at: completedAt,
          }),
        ...(task.assigned_level === "municipality" &&
          !task.municipality_seen_at && {
            municipality_seen_at: completedAt,
          }),
        resolution_description: completionDescription,
        resolution_photo_urls: [afterImage],
        actual_completion_date: completedAt,
        updated_at: new Date(),
        status_history: mergeWorkflowHistory(
          task.status_history,
          createWorkflowHistoryEntry({
            type: "status_changed",
            actor: authed,
            fromStatus: task.status,
            toStatus: "completed",
            fromLevel: task.assigned_level,
            toLevel: task.assigned_level,
            note: completionDescription,
          }),
        ) as unknown as Prisma.InputJsonValue,
      },
    });

    const post = await tx.report_posts.upsert({
      where: { task_id: task.id },
      create: {
        task_id: task.id,
        completion_id: completion.id,
        ward_id: task.ward_id,
        source_user_id: task.user_id,
        title: task.title,
        description: completionDescription,
        category: task.category,
        priority: task.priority,
        before_image_url: beforeImage,
        after_image_url: afterImage,
        ward_name_snapshot: task.wards?.name ?? "Unknown Ward",
        completed_by_name_snapshot: completedByName,
        completed_by_role_snapshot: completedByRole,
        completed_at: completedAt,
        task_snapshot: buildTaskSnapshot({
          id: task.id,
          title: task.title,
          description: task.description,
          category: task.category,
          priority: task.priority,
          status: "completed",
          submitted_at: task.submitted_at,
          ward_id: task.ward_id,
          ward_name: task.wards?.name ?? null,
          media_url: task.media_url,
          photo_urls: task.photo_urls,
          citizen_name: task.citizen_name,
        }),
        completion_snapshot: buildCompletionSnapshot({
          description: completionDescription,
          before_image_url: beforeImage,
          after_image_url: afterImage,
          completed_at: completedAt,
          completed_by_name: completedByName,
          completed_by_role: completedByRole,
        }),
      },
      update: {
        completion_id: completion.id,
        ward_id: task.ward_id,
        source_user_id: task.user_id,
        title: task.title,
        description: completionDescription,
        category: task.category,
        priority: task.priority,
        before_image_url: beforeImage,
        after_image_url: afterImage,
        ward_name_snapshot: task.wards?.name ?? "Unknown Ward",
        completed_by_name_snapshot: completedByName,
        completed_by_role_snapshot: completedByRole,
        completed_at: completedAt,
        task_snapshot: buildTaskSnapshot({
          id: task.id,
          title: task.title,
          description: task.description,
          category: task.category,
          priority: task.priority,
          status: "completed",
          submitted_at: task.submitted_at,
          ward_id: task.ward_id,
          ward_name: task.wards?.name ?? null,
          media_url: task.media_url,
          photo_urls: task.photo_urls,
          citizen_name: task.citizen_name,
        }),
        completion_snapshot: buildCompletionSnapshot({
          description: completionDescription,
          before_image_url: beforeImage,
          after_image_url: afterImage,
          completed_at: completedAt,
          completed_by_name: completedByName,
          completed_by_role: completedByRole,
        }),
        updated_at: new Date(),
      },
      select: { id: true },
    });

    await tx.activity_log.create({
      data: {
        report_id: task.id,
        actor_id: authed.id,
        actor_name: currentUser.name,
        action: "task_completed_and_posted",
        details: {
          after_image_url: afterImage,
          description: completionDescription,
          report_post_id: post.id,
        },
      },
    });

    return post.id;
  });

  if (task.user_id) {
    await createNotification({
      user_id: task.user_id,
      report_id: task.id,
      title: "Issue completed",
      message: `Your reported issue "${task.title}" has been completed and published.`,
      type: "success",
      link: `/reports/${updatedPostId}`,
      metadata: {
        eventType: "REPORT_PUBLISHED",
        reportId: task.id,
        reportPostId: updatedPostId,
      },
    });
  }

  if (task.assigned_level === "municipality") {
    const municipalityRecipients = await prisma.users.findMany({
      where: {
        role: { in: ["municipality", "admin"] },
        is_active: true,
        deleted_at: null,
        id: { not: currentUser.id },
      },
      select: { id: true },
    });
    const completedBy =
      task.users_reports_assigned_officer_idTousers?.name ??
      currentUser.name;

    await Promise.all(
      municipalityRecipients.map((recipient) =>
        createNotification({
          user_id: recipient.id,
          report_id: task.id,
          title: `Task completed by ${completedBy}`,
          message: `Task "${task.title}" was completed by ${completedBy}.`,
          type: "success",
          link: `/reports/${task.id}`,
          metadata: {
            eventType: "TASK_COMPLETED",
            reportId: task.id,
            reportPostId: updatedPostId,
            completedBy,
          },
        }),
      ),
    );
  }

  const reportPost = await getReportPost(prisma, user, updatedPostId);

  if (!reportPost) {
    throw new Error("Failed to load completed report post");
  }

  return reportPost;
}

export async function createRating(
  prisma: GQLContext["prisma"],
  user: GQLUser | null,
  args: { postId: string; rating: number },
) {
  const authed = assertAuthenticated(user);

  if (!canRate(authed.role)) {
    throw new Error("Only citizens can rate report posts");
  }

  if (args.rating < 1 || args.rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  const post = await prisma.report_posts.findUnique({
    where: { id: args.postId },
    select: { id: true },
  });

  if (!post) {
    throw new Error("Report post not found");
  }

  const rating = await prisma.$transaction(async (tx) => {
    const record = await tx.report_ratings.upsert({
      where: {
        post_id_user_id: {
          post_id: args.postId,
          user_id: authed.id,
        },
      },
      create: {
        post_id: args.postId,
        user_id: authed.id,
        rating: args.rating,
      },
      update: {
        rating: args.rating,
        updated_at: new Date(),
      },
    });

    await recalculatePostRatings(tx, args.postId);

    return record;
  });

  return rating;
}

export async function updateRating(
  prisma: GQLContext["prisma"],
  user: GQLUser | null,
  args: { postId: string; rating: number },
) {
  const authed = assertAuthenticated(user);

  if (!canRate(authed.role)) {
    throw new Error("Only citizens can rate report posts");
  }

  if (args.rating < 1 || args.rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  const existing = await prisma.report_ratings.findUnique({
    where: {
      post_id_user_id: {
        post_id: args.postId,
        user_id: authed.id,
      },
    },
  });

  if (!existing) {
    throw new Error("Rating not found for this post");
  }

  const rating = await prisma.$transaction(async (tx) => {
    const updated = await tx.report_ratings.update({
      where: { id: existing.id },
      data: {
        rating: args.rating,
        updated_at: new Date(),
      },
    });

    await recalculatePostRatings(tx, args.postId);
    return updated;
  });

  return rating;
}

export async function addComment(
  prisma: GQLContext["prisma"],
  user: GQLUser | null,
  args: { postId: string; content: string; parentId?: string | null },
) {
  const authed = assertAuthenticated(user);

  if (!canComment(authed.role)) {
    throw new Error("You must be logged in to comment");
  }

  const content = args.content.trim();

  if (content.length < 2) {
    throw new Error("Comment must be at least 2 characters");
  }

  const post = await prisma.report_posts.findUnique({
    where: { id: args.postId },
    select: { id: true },
  });

  if (!post) {
    throw new Error("Report post not found");
  }

  let parentComment: ReportCommentRecord | null = null;

  if (args.parentId) {
    parentComment = await prisma.report_comments.findUnique({
      where: { id: args.parentId },
      include: reportCommentInclude,
    });

    if (!parentComment || parentComment.post_id !== args.postId) {
      throw new Error("Parent comment not found");
    }
  }

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.report_comments.create({
      data: {
        post_id: args.postId,
        user_id: authed.id,
        parent_id: args.parentId ?? null,
        content,
        anonymous_name: getAnonymousDisplayName(args.postId, authed.id),
      },
      include: reportCommentInclude,
    });

    await tx.report_posts.update({
      where: { id: args.postId },
      data: {
        comment_count: { increment: 1 },
        updated_at: new Date(),
      },
    });

    if (parentComment) {
      await tx.report_comments.update({
        where: { id: parentComment.id },
        data: {
          reply_count: { increment: 1 },
          updated_at: new Date(),
        },
      });
    }

    return created;
  });

  // Notify parent comment author when this is a reply
  if (parentComment && parentComment.user_id && parentComment.user_id !== authed.id) {
    try {
      const replierName = authed.email ?? "Someone";
      const postRes = await prisma.report_posts.findUnique({
        where: { id: args.postId },
        select: { title: true },
      });
      const postTitle = postRes?.title || "Untitled";
      const preview = content.length > 80 ? `${content.slice(0, 77)}...` : content;

      await createNotification({
        user_id: parentComment.user_id,
        report_id: null,
        type: "report_post_reply" as any,
        title: "Someone replied to your comment",
        message: `${replierName} replied to your comment on "${postTitle}": ${preview}`,
        link: `/report-post/${args.postId}`,
        metadata: {
          eventType: "REPORT_POST_REPLY",
          postId: args.postId,
          commentId: comment.id,
          parentCommentId: parentComment.id,
        },
      });
    } catch (err) {
      console.error("notifyReportPostReply error:", err);
    }
  }

  const wardCodes = await buildWardCodeLookup(prisma, [comment]);

  return mapComment(comment, user, [], wardCodes);
}

export async function reportComment(
  prisma: GQLContext["prisma"],
  user: GQLUser | null,
  args: { commentId: string; reason: string },
) {
  const authed = assertAuthenticated(user);

  if (!canReportComment(authed.role)) {
    throw new Error("Only citizens can report comments");
  }

  const reason = args.reason.trim();

  if (reason.length < 5) {
    throw new Error("Reason must be at least 5 characters");
  }

  const comment = await prisma.report_comments.findUnique({
    where: { id: args.commentId },
    select: { id: true, user_id: true },
  });

  if (!comment) {
    throw new Error("Comment not found");
  }

  if (comment.user_id === authed.id) {
    throw new Error("You cannot report your own comment");
  }

  return prisma.report_comment_reports.upsert({
    where: {
      comment_id_user_id: {
        comment_id: args.commentId,
        user_id: authed.id,
      },
    },
    create: {
      comment_id: args.commentId,
      user_id: authed.id,
      reason,
    },
    update: {
      reason,
    },
  });
}

export async function toggleBookmark(
  prisma: GQLContext["prisma"],
  user: GQLUser | null,
  args: { postId: string },
) {
  const authed = assertAuthenticated(user);

  if (!canBookmark(authed.role)) {
    throw new Error("Only citizens can bookmark report posts");
  }

  const existing = await prisma.report_post_bookmarks.findUnique({
    where: {
      post_id_user_id: {
        post_id: args.postId,
        user_id: authed.id,
      },
    },
  });

  const result = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.report_post_bookmarks.delete({
        where: { id: existing.id },
      });

      const updated = await tx.report_posts.update({
        where: { id: args.postId },
        data: {
          bookmark_count: { decrement: 1 },
          updated_at: new Date(),
        },
      });

      return {
        post_id: args.postId,
        is_bookmarked: false,
        bookmark_count: updated.bookmark_count,
      };
    }

    await tx.report_post_bookmarks.create({
      data: {
        post_id: args.postId,
        user_id: authed.id,
      },
    });

    const updated = await tx.report_posts.update({
      where: { id: args.postId },
      data: {
        bookmark_count: { increment: 1 },
        updated_at: new Date(),
      },
    });

    return {
      post_id: args.postId,
      is_bookmarked: true,
      bookmark_count: updated.bookmark_count,
    };
  });

  return result;
}

export async function editReportPost(
  prisma: GQLContext["prisma"],
  user: GQLUser | null,
  args: {
    postId: string;
    description?: string | null;
    afterImage?: string | null;
  },
) {
  const authed = assertAuthenticated(user);
  const post = await prisma.report_posts.findUnique({
    where: { id: args.postId },
    include: reportPostBaseInclude,
  });

  if (!post) {
    throw new Error("Report post not found");
  }

  assertCanEditPost(authed, {
    ward_id: post.reports.ward_id,
    assigned_level: post.reports.assigned_level,
    assigned_officer_id: post.reports.assigned_officer_id,
  });

  const nextDescription =
    normalizeOptionalText(args.description) ??
    post.description ??
    normalizeOptionalText(post.reports.description) ??
    "Task completed";
  const nextAfterImage = normalizeOptionalText(args.afterImage) ?? post.after_image_url;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.task_completions.update({
      where: { id: post.task_completions.id },
      data: {
        description: nextDescription,
        after_image_url: nextAfterImage,
        updated_at: new Date(),
      },
    });

    await tx.activity_log.create({
      data: {
        report_id: post.task_id,
        actor_id: authed.id,
        actor_name: authed.email,
        action: "report_post_edited",
        details: {
          report_post_id: post.id,
          description: nextDescription,
          after_image_url: nextAfterImage,
        },
      },
    });

    await tx.report_posts.update({
      where: { id: post.id },
      data: {
        description: nextDescription,
        after_image_url: nextAfterImage,
        completion_snapshot: buildCompletionSnapshot({
          description: nextDescription,
          before_image_url: post.before_image_url,
          after_image_url: nextAfterImage,
          completed_at: post.completed_at,
          completed_by_name: post.completed_by_name_snapshot,
          completed_by_role: post.completed_by_role_snapshot,
        }),
        edited_count: { increment: 1 },
        updated_at: new Date(),
      },
    });

    return tx.report_posts.findUnique({
      where: { id: post.id },
      include: reportPostBaseInclude,
    });
  });

  if (!updated) {
    throw new Error("Failed to update report post");
  }

  const { ratingMap, bookmarkSet } = await fetchViewerState(
    prisma,
    authed.id,
    [updated.id],
  );

  return mapReportPost(updated, authed, {
    viewerRating: ratingMap.get(updated.id) ?? null,
    isBookmarked: bookmarkSet.has(updated.id),
  });
}
