import { report_status } from "@/app/generated/prisma";
import type { GQLContext } from "../context";
import { buildBoardScopeWhere } from "@/src/lib/reportWorkflowServer";
import { getWardHappinessMetrics } from "@/src/lib/reportWorkflowEnforcer";
import { getReportDeadlineAt } from "@/src/lib/reportWorkflow";
import { createNotification } from "./notification.resolver";

type AnalyticsReportRecord = {
  id: string;
  title: string;
  category: string;
  status: report_status;
  upvote_count: number;
  comment_count: number;
  created_at: Date;
  updated_at: Date;
  actual_completion_date: Date | null;
  incoming_ack_deadline_at: Date | null;
  municipality_deadline_at: Date | null;
  ward_active_started_at: Date | null;
  ward_deadline_at: Date | null;
  assigned_level: "ward" | "municipality";
  ward_id: string | null;
};

type AnalyticsSummary = {
  total_reports: number;
  pending_reports: number;
  in_progress_reports: number;
  completed_reports: number;
  invalid_reports: number;
  returned_reports: number;
  completion_rate: number;
  active_rate: number;
  overdue_reports: number;
  happiness_score: number;
  happiness_penalty_total: number;
  incoming_not_seen_count: number;
  report_not_seen_escalation_count: number;
  deadline_missed_escalation_count: number;
  avg_resolution_hours: number;
  window_created_reports: number;
  window_completed_reports: number;
};

type AnalyticsTimelinePoint = {
  date: string;
  created_count: number;
  completed_count: number;
  in_progress_count: number;
};

type AnalyticsStatusBreakdown = {
  status: report_status;
  count: number;
  percentage: number;
};

type AnalyticsCategoryBreakdown = {
  category: string;
  count: number;
  percentage: number;
};

type AnalyticsTopTask = {
  id: string;
  title: string;
  category: string;
  status: report_status;
  upvote_count: number;
  comment_count: number;
  created_at: string;
};

type PublishedAnalyticsPayload = {
  title: string;
  narrative: string;
  auto_published: boolean;
  period_days: number;
  period_start: string;
  period_end: string;
  summary: AnalyticsSummary;
  timeline: AnalyticsTimelinePoint[];
  status_breakdown: AnalyticsStatusBreakdown[];
  category_breakdown: AnalyticsCategoryBreakdown[];
  top_upvoted_tasks: AnalyticsTopTask[];
  scope: {
    role: string;
    ward_id: string | null;
  };
};

type AnalyticsSnapshotRecord = {
  id: string;
  snapshot_date: Date;
  created_at: Date;
  metrics: unknown;
};

const ANALYTICS_PERIOD_DAYS = 7;
const AUTO_PUBLISH_MESSAGE = "Analytics reports publish automatically every 7 days.";
const WARD_AUTO_PUBLISH_MESSAGE =
  "Ward analytics reports publish automatically every 7 days and cannot be published manually.";
const NO_ISSUES_REPORTED_MESSAGE =
  "There have been no issues reported in the last 7 days.";

function requireDashboardUser(user: GQLContext["user"]) {
  if (!user) throw new Error("Not authenticated");
  if (!["admin", "municipality", "ward"].includes(user.role)) {
    throw new Error("Only dashboard users can access analytics");
  }
  return user;
}

function clampDays(days?: number | null) {
  if (!days || Number.isNaN(days)) return ANALYTICS_PERIOD_DAYS;
  return ANALYTICS_PERIOD_DAYS;
}

function startOfDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function round(value: number, digits = 1) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getPeriod(days: number, referenceDate: Date = new Date()) {
  const today = startOfDay(referenceDate);
  const periodEnd = addDays(today, 1);
  const periodStart = addDays(periodEnd, -days);
  const previousStart = addDays(periodStart, -days);
  const previousEnd = periodStart;

  return { today, periodStart, periodEnd, previousStart, previousEnd };
}

function buildSummary(
  reports: AnalyticsReportRecord[],
  days: number,
  happinessMetrics?: {
    happinessScore: number;
    totalPenaltyPoints: number;
    incomingNotSeenCount: number;
    reportNotSeenEscalationCount: number;
    deadlineMissedEscalationCount: number;
  },
  referenceDate: Date = new Date(),
): AnalyticsSummary {
  const now = new Date();
  const { periodStart, periodEnd } = getPeriod(days, referenceDate);

  const counts: Record<report_status, number> = {
    incoming: 0,
    in_progress: 0,
    completed: 0,
    invalid: 0,
    returned: 0,
  };

  let overdueReports = 0;
  let totalResolutionHours = 0;
  let resolutionSamples = 0;
  let windowCreatedReports = 0;
  let windowCompletedReports = 0;

  for (const report of reports) {
    counts[report.status] += 1;

    const activeDeadlineAt = getReportDeadlineAt(report);
    const deadlineDate =
      typeof activeDeadlineAt === "string"
        ? new Date(activeDeadlineAt)
        : activeDeadlineAt;

    if (
      deadlineDate &&
      deadlineDate < now &&
      report.status !== "completed" &&
      report.status !== "invalid"
    ) {
      overdueReports += 1;
    }

    if (report.created_at >= periodStart && report.created_at < periodEnd) {
      windowCreatedReports += 1;
    }

    if (
      report.actual_completion_date &&
      report.actual_completion_date >= periodStart &&
      report.actual_completion_date < periodEnd
    ) {
      windowCompletedReports += 1;
    }

    if (report.status === "completed" && report.actual_completion_date) {
      totalResolutionHours +=
        (report.actual_completion_date.getTime() - report.created_at.getTime()) /
        (1000 * 60 * 60);
      resolutionSamples += 1;
    }
  }

  const totalReports = reports.length;
  const completedReports = counts.completed;
  const activeReports = counts.incoming + counts.in_progress;

  return {
    total_reports: totalReports,
    pending_reports: counts.incoming,
    in_progress_reports: counts.in_progress,
    completed_reports: completedReports,
    invalid_reports: counts.invalid,
    returned_reports: counts.returned,
    completion_rate: totalReports === 0 ? 0 : round((completedReports / totalReports) * 100),
    active_rate: totalReports === 0 ? 0 : round((activeReports / totalReports) * 100),
    overdue_reports: overdueReports,
    happiness_score: happinessMetrics?.happinessScore ?? 100,
    happiness_penalty_total: happinessMetrics?.totalPenaltyPoints ?? 0,
    incoming_not_seen_count: happinessMetrics?.incomingNotSeenCount ?? 0,
    report_not_seen_escalation_count:
      happinessMetrics?.reportNotSeenEscalationCount ?? 0,
    deadline_missed_escalation_count:
      happinessMetrics?.deadlineMissedEscalationCount ?? 0,
    avg_resolution_hours:
      resolutionSamples === 0 ? 0 : round(totalResolutionHours / resolutionSamples),
    window_created_reports: windowCreatedReports,
    window_completed_reports: windowCompletedReports,
  };
}

function buildTimeline(
  reports: AnalyticsReportRecord[],
  days: number,
  referenceDate: Date = new Date(),
): AnalyticsTimelinePoint[] {
  const { periodStart } = getPeriod(days, referenceDate);
  const timeline = Array.from({ length: days }, (_, index) => {
    const day = addDays(periodStart, index);
    return {
      date: toIsoDate(day),
      created_count: 0,
      completed_count: 0,
      in_progress_count: 0,
    };
  });

  const indexByDate = new Map(timeline.map((point, index) => [point.date, index]));

  for (const report of reports) {
    const createdKey = toIsoDate(report.created_at);
    const createdIndex = indexByDate.get(createdKey);
    if (createdIndex !== undefined) {
      timeline[createdIndex].created_count += 1;
    }

    if (report.actual_completion_date) {
      const completedKey = toIsoDate(report.actual_completion_date);
      const completedIndex = indexByDate.get(completedKey);
      if (completedIndex !== undefined) {
        timeline[completedIndex].completed_count += 1;
      }
    }

    if (report.status === "in_progress") {
      const progressKey = toIsoDate(report.updated_at);
      const progressIndex = indexByDate.get(progressKey);
      if (progressIndex !== undefined) {
        timeline[progressIndex].in_progress_count += 1;
      }
    }
  }

  return timeline;
}

function buildStatusBreakdown(
  summary: AnalyticsSummary,
): AnalyticsStatusBreakdown[] {
  const total = Math.max(summary.total_reports, 1);
  const breakdown: Array<[report_status, number]> = [
    ["incoming", summary.pending_reports],
    ["in_progress", summary.in_progress_reports],
    ["completed", summary.completed_reports],
    ["invalid", summary.invalid_reports],
    ["returned", summary.returned_reports],
  ];

  return breakdown.map(([status, count]) => ({
    status,
    count,
    percentage: round((count / total) * 100),
  }));
}

function buildCategoryBreakdown(
  reports: AnalyticsReportRecord[],
): AnalyticsCategoryBreakdown[] {
  const total = Math.max(reports.length, 1);
  const counts = new Map<string, number>();

  for (const report of reports) {
    counts.set(report.category, (counts.get(report.category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([category, count]) => ({
      category,
      count,
      percentage: round((count / total) * 100),
    }));
}

function createPublishedPayload(
  reports: AnalyticsReportRecord[],
  user: NonNullable<GQLContext["user"]>,
  happinessMetrics?: {
    happinessScore: number;
    totalPenaltyPoints: number;
    incomingNotSeenCount: number;
    reportNotSeenEscalationCount: number;
    deadlineMissedEscalationCount: number;
  },
  referenceDate: Date = new Date(),
): PublishedAnalyticsPayload {
  const periodDays = ANALYTICS_PERIOD_DAYS;
  const { periodStart, periodEnd } = getPeriod(periodDays, referenceDate);
  const summary = buildSummary(
    reports,
    periodDays,
    happinessMetrics,
    referenceDate,
  );
  const windowCreatedReports = summary.window_created_reports;
  const narrative =
    windowCreatedReports === 0
      ? NO_ISSUES_REPORTED_MESSAGE
      : `${windowCreatedReports} issue${windowCreatedReports === 1 ? "" : "s"} reported in the last 7 days.`;

  return {
    title: `${periodDays}-Day Report`,
    narrative,
    auto_published: true,
    period_days: periodDays,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    summary,
    timeline: buildTimeline(reports, periodDays, referenceDate),
    status_breakdown: buildStatusBreakdown(summary),
    category_breakdown: buildCategoryBreakdown(reports),
    top_upvoted_tasks: buildTopUpvotedTasks(reports),
    scope: {
      role: user.role,
      ward_id: user.wardId ?? null,
    },
  };
}

function readPublishedMetrics(metrics: unknown): Partial<PublishedAnalyticsPayload> {
  return metrics && typeof metrics === "object"
    ? (metrics as Partial<PublishedAnalyticsPayload>)
    : {};
}

function buildTopUpvotedTasks(reports: AnalyticsReportRecord[]): AnalyticsTopTask[] {
  return [...reports]
    .sort((left, right) => {
      if (right.upvote_count !== left.upvote_count) {
        return right.upvote_count - left.upvote_count;
      }
      if (right.comment_count !== left.comment_count) {
        return right.comment_count - left.comment_count;
      }
      return right.created_at.getTime() - left.created_at.getTime();
    })
    .slice(0, 3)
    .map((report) => ({
      id: report.id,
      title: report.title,
      category: report.category,
      status: report.status,
      upvote_count: report.upvote_count,
      comment_count: report.comment_count,
      created_at: report.created_at.toISOString(),
    }));
}

function matchesPublishScope(
  snapshot: Pick<AnalyticsSnapshotRecord, "metrics">,
  user: NonNullable<GQLContext["user"]>,
) {
  const metrics = readPublishedMetrics(snapshot.metrics);
  const scopeRole = metrics.scope?.role;
  const scopeWardId = metrics.scope?.ward_id ?? null;

  if (user.role === "ward") {
    return scopeRole === "ward" && scopeWardId === (user.wardId ?? null);
  }

  if (user.role === "municipality") {
    return scopeRole === "municipality";
  }

  return scopeRole === "admin";
}

function formatPublishedSnapshot(snapshot: {
  id: string;
  snapshot_date: Date;
  created_at: Date;
  metrics: unknown;
}) {
  const metrics = readPublishedMetrics(snapshot.metrics);

  const periodDays =
    typeof metrics.period_days === "number"
      ? metrics.period_days
      : ANALYTICS_PERIOD_DAYS;
  const periodStart =
    typeof metrics.period_start === "string"
      ? new Date(metrics.period_start)
      : addDays(snapshot.snapshot_date, -periodDays);
  const periodEnd =
    typeof metrics.period_end === "string"
      ? new Date(metrics.period_end)
      : addDays(snapshot.snapshot_date, 1);

  return {
    id: snapshot.id,
    title:
      typeof metrics.title === "string" && metrics.title.trim().length > 0
        ? metrics.title
        : `${periodDays}-Day Report`,
    narrative:
      typeof metrics.narrative === "string" && metrics.narrative.trim().length > 0
        ? metrics.narrative
        : NO_ISSUES_REPORTED_MESSAGE,
    auto_published: metrics.auto_published !== false,
    period_days: periodDays,
    period_start: periodStart,
    period_end: periodEnd,
    snapshot_date: snapshot.snapshot_date,
    created_at: snapshot.created_at,
    summary: metrics.summary ?? buildSummary([], periodDays, undefined),
    timeline: Array.isArray(metrics.timeline) ? metrics.timeline : [],
    status_breakdown: Array.isArray(metrics.status_breakdown)
      ? metrics.status_breakdown
      : [],
    category_breakdown: Array.isArray(metrics.category_breakdown)
      ? metrics.category_breakdown
      : [],
    top_upvoted_tasks: Array.isArray(metrics.top_upvoted_tasks)
      ? metrics.top_upvoted_tasks
      : [],
  };
}

async function getScopedReports(
  prisma: GQLContext["prisma"],
  user: NonNullable<GQLContext["user"]>,
) {
  return prisma.reports.findMany({
    where: buildBoardScopeWhere(user),
    select: {
      id: true,
      title: true,
      category: true,
      status: true,
      upvote_count: true,
      comment_count: true,
      created_at: true,
      updated_at: true,
      actual_completion_date: true,
      incoming_ack_deadline_at: true,
      municipality_deadline_at: true,
      ward_active_started_at: true,
      ward_deadline_at: true,
      assigned_level: true,
      ward_id: true,
    },
  });
}

async function getScopedHappinessSummary(
  prisma: GQLContext["prisma"],
  user: NonNullable<GQLContext["user"]>,
  reports: AnalyticsReportRecord[],
) {
  const wardIds = [
    ...(user.wardId ? [user.wardId] : []),
    ...reports
      .map((report) => report.ward_id)
      .filter((wardId): wardId is string => Boolean(wardId)),
  ];
  const happinessMetricsByWard = await getWardHappinessMetrics(prisma, wardIds);

  const scoped = [...new Set(wardIds)].reduce(
    (acc, wardId) => {
      const metrics = happinessMetricsByWard.get(wardId);

      if (!metrics) {
        return acc;
      }

      acc.happinessScoreTotal += metrics.happinessScore;
      acc.wardCount += 1;
      acc.totalPenaltyPoints += metrics.totalPenaltyPoints;
      acc.incomingNotSeenCount += metrics.incomingNotSeenCount;
      acc.reportNotSeenEscalationCount += metrics.reportNotSeenEscalationCount;
      acc.deadlineMissedEscalationCount +=
        metrics.deadlineMissedEscalationCount;
      return acc;
    },
    {
      happinessScoreTotal: 0,
      wardCount: 0,
      totalPenaltyPoints: 0,
      incomingNotSeenCount: 0,
      reportNotSeenEscalationCount: 0,
      deadlineMissedEscalationCount: 0,
    },
  );

  return {
    happinessScore:
      scoped.wardCount === 0
        ? 100
        : round(scoped.happinessScoreTotal / scoped.wardCount),
    totalPenaltyPoints: scoped.totalPenaltyPoints,
    incomingNotSeenCount: scoped.incomingNotSeenCount,
    reportNotSeenEscalationCount: scoped.reportNotSeenEscalationCount,
    deadlineMissedEscalationCount: scoped.deadlineMissedEscalationCount,
  };
}

async function getPublishedSnapshots(
  prisma: GQLContext["prisma"],
  user: NonNullable<GQLContext["user"]>,
) {
  const snapshots = await prisma.analytics_snapshots.findMany({
    orderBy: [{ snapshot_date: "desc" }, { created_at: "desc" }],
  });

  return snapshots
    .filter((snapshot) => {
      const metrics = readPublishedMetrics(snapshot.metrics);
      const scopeRole = metrics.scope?.role;
      const scopeWardId = metrics.scope?.ward_id ?? null;

      if (user.role === "ward") {
        return scopeRole === "ward" && scopeWardId === (user.wardId ?? null);
      }

      if (user.role === "municipality") {
        return scopeRole === "municipality";
      }

      return scopeRole === "admin";
    })
    .map(formatPublishedSnapshot)
    .slice(0, 8);
}

async function createAnalyticsSnapshot(
  prisma: GQLContext["prisma"],
  user: NonNullable<GQLContext["user"]>,
  referenceDate: Date,
) {
  const reports = await getScopedReports(prisma, user);
  const happinessMetrics = await getScopedHappinessSummary(prisma, user, reports);
  const payload = createPublishedPayload(
    reports,
    user,
    happinessMetrics,
    referenceDate,
  );

  return prisma.analytics_snapshots.create({
    data: {
      snapshot_date: startOfDay(referenceDate),
      metrics: payload,
    },
  });
}

async function getAnalyticsNotificationRecipients(
  prisma: GQLContext["prisma"],
  user: NonNullable<GQLContext["user"]>,
) {
  if (user.role === "ward" && user.wardId) {
    const recipients = await prisma.users.findMany({
      where: {
        role: "ward",
        ward_id: user.wardId,
        is_active: true,
        deleted_at: null,
      },
      select: { id: true },
    });

    return recipients.map((recipient) => recipient.id);
  }

  if (user.role === "municipality") {
    const recipients = await prisma.users.findMany({
      where: {
        role: { in: ["municipality", "admin"] },
        municipality_id: user.municipalityId ?? undefined,
        is_active: true,
        deleted_at: null,
      },
      select: { id: true },
    });

    return recipients.map((recipient) => recipient.id);
  }

  const recipients = await prisma.users.findMany({
    where: {
      role: "admin",
      is_active: true,
      deleted_at: null,
    },
    select: { id: true },
  });

  return recipients.map((recipient) => recipient.id);
}

async function notifyPublishedAnalyticsSnapshot(
  prisma: GQLContext["prisma"],
  user: NonNullable<GQLContext["user"]>,
  snapshot: Awaited<ReturnType<typeof createAnalyticsSnapshot>>,
) {
  const recipients = await getAnalyticsNotificationRecipients(prisma, user);
  const uniqueRecipients = [...new Set(recipients)];
  const scopeName =
    user.role === "ward"
      ? "your ward"
      : user.role === "municipality"
        ? "your municipality"
        : "the dashboard";

  await Promise.all(
    uniqueRecipients.map((recipientId) =>
      createNotification({
        user_id: recipientId,
        title: "7-day report has been published",
        message: `A new 7-day analytics report has been published for ${scopeName}.`,
        type: "success",
        link: "/dashboard/analytics",
        metadata: {
          eventType: "REPORT_PUBLISHED",
          snapshotId: snapshot.id,
          scopeRole: user.role,
          wardId: user.wardId ?? null,
          municipalityId: user.municipalityId ?? null,
        },
      }),
    ),
  );
}

async function ensureAutoPublishedSnapshot(
  prisma: GQLContext["prisma"],
  user: NonNullable<GQLContext["user"]>,
) {
  const snapshots = await prisma.analytics_snapshots.findMany({
    orderBy: [{ snapshot_date: "desc" }, { created_at: "desc" }],
  });

  const latestScopedSnapshot = snapshots.find((snapshot) =>
    matchesPublishScope(snapshot, user),
  );

  if (!latestScopedSnapshot) {
    const snapshot = await createAnalyticsSnapshot(prisma, user, new Date());
    await notifyPublishedAnalyticsSnapshot(prisma, user, snapshot);
    return { snapshot, created: true };
  }

  const nextPublishAt = addDays(
    new Date(latestScopedSnapshot.created_at),
    ANALYTICS_PERIOD_DAYS,
  );

  if (new Date() < nextPublishAt) {
    return { snapshot: latestScopedSnapshot, created: false };
  }

  const snapshot = await createAnalyticsSnapshot(prisma, user, new Date());
  await notifyPublishedAnalyticsSnapshot(prisma, user, snapshot);
  return { snapshot, created: true };
}

export const analyticsResolvers = {
  Query: {
    dashboardAnalytics: async (
      _: unknown,
      { days }: { days?: number | null },
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireDashboardUser(user);
      const periodDays = clampDays(days);
      await ensureAutoPublishedSnapshot(prisma, authed);
      const reports = await getScopedReports(prisma, authed);
      const happinessMetrics = await getScopedHappinessSummary(
        prisma,
        authed,
        reports,
      );
      const summary = buildSummary(reports, periodDays, happinessMetrics);

      return {
        summary,
        timeline: buildTimeline(reports, periodDays),
        status_breakdown: buildStatusBreakdown(summary),
        category_breakdown: buildCategoryBreakdown(reports),
        top_upvoted_tasks: buildTopUpvotedTasks(reports),
        published_reports: await getPublishedSnapshots(prisma, authed),
        period_days: periodDays,
        generated_at: new Date(),
      };
    },
  },

  Mutation: {
    publishAnalyticsReport: async (
      _: unknown,
      { days }: { days?: number | null },
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireDashboardUser(user);
      clampDays(days);

      if (authed.role === "ward") {
        throw new Error(WARD_AUTO_PUBLISH_MESSAGE);
      }

      const { snapshot, created } = await ensureAutoPublishedSnapshot(prisma, authed);

      if (!created) {
        throw new Error(AUTO_PUBLISH_MESSAGE);
      }

      return formatPublishedSnapshot(snapshot);
    },
  },
};
