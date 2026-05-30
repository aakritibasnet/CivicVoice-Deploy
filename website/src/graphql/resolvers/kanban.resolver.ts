import { Prisma, report_status, user_role } from "@/app/generated/prisma/client";
import { GQLContext } from "../context";
import type { WorkflowStatus, WorkflowView } from "@/src/lib/reportWorkflow";
import { FIXED_DEPARTMENT_SLUGS } from "@/src/features/departments/catalog";
import {
  assertWorkflowAssignmentForCompletion,
  hasWorkflowAssignment,
} from "@/src/lib/reportAssignments";
import {
  assertCanManageReport,
  buildBoardScopeWhere,
  createWorkflowHistoryEntry,
  findWorkflowColumn,
  formatReportCard,
  getWorkflowViewForRole,
  mergeWorkflowHistory,
  reportCardInclude,
  reportMatchesWorkflowColumn,
  resolveWorkflowColumnId,
} from "@/src/lib/reportWorkflowServer";
import {
  DEFAULT_ACTIVE_DEADLINE_DAYS,
  DEADLINE_REASON_THRESHOLD_DAYS,
  getDeadlineReasonThresholdAt,
  getDefaultActiveDeadlineAt,
  requiresDeadlineReason,
} from "@/src/lib/reportTimeline";
import { createNotification } from "./notification.resolver";

type DashboardRole = "ward" | "municipality" | "admin";

interface UpdateColumnInput {
  name?: string;
  position?: number;
  color?: string;
  deadline_days?: number | null;
  is_terminal?: boolean;
  mapped_status?: report_status;
}

// Sort rank range: 0 is highest urgency, 3 is lowest; unknown values go last.
const PRIORITY_SORT_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
const UNKNOWN_PRIORITY_SORT_RANK = 4;

function getPrioritySortRank(priority: string | null | undefined) {
  return PRIORITY_SORT_RANK[priority ?? ""] ?? UNKNOWN_PRIORITY_SORT_RANK;
}

function compareReportsForColumn(
  column: { mapped_status: report_status },
  a: { priority: string; created_at: Date; id: string },
  b: { priority: string; created_at: Date; id: string },
) {
  if (column.mapped_status === "incoming" || column.mapped_status === "in_progress") {
    const priorityDiff =
      getPrioritySortRank(a.priority) - getPrioritySortRank(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
  }

  const createdDiff = b.created_at.getTime() - a.created_at.getTime();
  if (createdDiff !== 0) return createdDiff;

  return b.id.localeCompare(a.id);
}

function requireAuth(user: GQLContext["user"]) {
  if (!user) throw new Error("Not authenticated");
  return user;
}

function requireAdmin(user: GQLContext["user"]) {
  const authed = requireAuth(user);
  if (!["admin", "municipality", "ward"].includes(authed.role)) {
    throw new Error(
      "Only administrators, municipality and ward can modify board configuration",
    );
  }
  return authed;
}

function assertOwnsWorkflow(
  user: NonNullable<GQLContext["user"]>,
  report: {
    assigned_level: string;
    returned_to_ward_at: Date | null;
  },
) {
  if (user.role === "ward" && report.assigned_level !== "ward") {
    throw new Error("This report is currently assigned to municipality");
  }

  if (
    user.role === "municipality" &&
    report.assigned_level !== "municipality"
  ) {
    throw new Error("This report is no longer assigned to municipality");
  }
}

function requireReason(reason?: string | null) {
  if (!reason || reason.trim().length < 10) {
    throw new Error("A reason of at least 10 characters is required");
  }

  return reason.trim();
}

function requireDeadlineAt(deadlineAt?: string | Date | null) {
  if (!deadlineAt) {
    throw new Error("A new deadline is required");
  }

  const parsed = new Date(deadlineAt);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("A valid deadline is required");
  }

  return parsed;
}

function validateDeadlineReason(params: {
  baselineAt: Date;
  deadlineAt: Date;
  reason?: string | null;
}) {
  const trimmedReason = params.reason?.trim() || null;

  if (requiresDeadlineReason(params.baselineAt, params.deadlineAt) && !trimmedReason) {
    throw new Error(
      `A reason is required when the deadline goes beyond ${DEADLINE_REASON_THRESHOLD_DAYS} days`,
    );
  }

  return trimmedReason;
}

function formatOfficerName(officer: {
  first_name: string;
  last_name: string;
}) {
  return [officer.first_name, officer.last_name].filter(Boolean).join(" ").trim();
}

function getReportLink(reportId: string) {
  return `/reports/${reportId}`;
}

function getOfficerTaskLink(reportId: string) {
  return `/officer-task/${reportId}`;
}

async function notifyOfficer(
  officerId: string | null | undefined,
  payload: {
    reportId: string;
    title: string;
    message: string;
    type?:
      | "info"
      | "success"
      | "warning"
      | "error"
      | "status_change"
      | "report_assigned"
      | "report_escalated"
      | "report_returned"
      | "task_assigned"
      | "task_returned"
      | "task_invalidated"
      | "task_escalated"
      | "task_completed"
      | "task_reassigned"
      | "task_comment"
      | "task_status_updated";
    metadata?: Record<string, unknown> | null;
  },
) {
  if (!officerId) {
    return;
  }

  await createNotification({
    user_id: officerId,
    recipient_role: "officer",
    report_id: payload.reportId,
    title: payload.title,
    message: payload.message,
    type: payload.type ?? "info",
    link: getOfficerTaskLink(payload.reportId),
    metadata: {
      taskId: payload.reportId,
      reportId: payload.reportId,
      ...(payload.metadata ?? {}),
    },
  });
}

async function notifyUsers(
  userIds: string[],
  payload: {
    report_id?: string | null;
    title: string;
    message: string;
    type?: "info" | "success" | "warning" | "error" | "report_assigned";
    link?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];

  for (const userId of uniqueUserIds) {
    await createNotification({
      user_id: userId,
      report_id: payload.report_id,
      title: payload.title,
      message: payload.message,
      type: payload.type,
      link: payload.link,
      metadata: payload.metadata,
    });
  }
}

async function notifyReportOwner(
  prisma: GQLContext["prisma"],
  report: {
    id: string;
    user_id: string | null;
    title: string | null;
  },
  targetStatus: string,
) {
  if (!report.user_id) return;

  const reportTitle = report.title || "Untitled";

  let title: string;
  let message: string;

  switch (targetStatus) {
    case "in_progress":
      title = "Your report is now in progress";
      message = `Your report "${reportTitle}" is now being worked on. Click here to see details.`;
      break;
    case "completed":
      title = "Your report has been resolved";
      message = `Your report "${reportTitle}" has been resolved. Click here to see details.`;
      break;
    case "invalid":
      title = "Your report was marked as invalid";
      message = `Your report "${reportTitle}" was marked as invalid. Click here to see details.`;
      break;
    default: {
      const statusLabel = targetStatus.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      title = `Report Update: ${statusLabel}`;
      message = `Your report "${reportTitle}" was updated to ${statusLabel}.`;
      break;
    }
  }

  await createNotification({
    user_id: report.user_id,
    report_id: report.id,
    type: "status_change",
    title,
    message,
    link: getReportLink(report.id),
    metadata: {
      eventType: "STATUS_CHANGE",
      reportId: report.id,
      status: targetStatus,
    },
  });

  // Also notify followers via raw query (report_followers not in website Prisma schema)
  try {
    const followers = await prisma.$queryRaw<{ user_id: string }[]>(
      Prisma.sql`SELECT user_id FROM report_followers WHERE report_id = CAST(${report.id} AS UUID)`,
    );

    const statusLabel = targetStatus.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    for (const follower of followers) {
      if (follower.user_id === report.user_id) continue;
      await createNotification({
        user_id: follower.user_id,
        report_id: report.id,
        type: "status_change",
        title: `Followed report: ${statusLabel}`,
        message: `A report you follow "${reportTitle}" was updated to ${statusLabel}.`,
        link: getReportLink(report.id),
        metadata: {
          eventType: "STATUS_CHANGE",
          reportId: report.id,
          status: targetStatus,
        },
      });
    }
  } catch (err) {
    console.error("notifyReportOwner followers error:", err);
  }
}

async function findWardDashboardUserIds(
  prisma: GQLContext["prisma"],
  wardId: string | null,
  excludeUserId?: string,
) {
  if (!wardId) {
    return [];
  }

  const users = await prisma.users.findMany({
    where: {
      role: "ward",
      ward_id: wardId,
      is_active: true,
      deleted_at: null,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });

  return users.map((user) => user.id);
}

async function findMunicipalityDashboardUserIds(
  prisma: GQLContext["prisma"],
  excludeUserId?: string,
) {
  const users = await prisma.users.findMany({
    where: {
      role: { in: ["municipality", "admin"] },
      is_active: true,
      deleted_at: null,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });

  return users.map((user) => user.id);
}

async function findFixedDepartment(
  prisma: GQLContext["prisma"],
  departmentId: string,
) {
  const department = await prisma.officer_departments.findFirst({
    where: {
      id: departmentId,
      slug: { in: FIXED_DEPARTMENT_SLUGS },
    },
  });

  if (!department) {
    throw new Error("Department not found in the fixed catalog");
  }

  return department;
}

async function findAssignableOfficer(
  prisma: GQLContext["prisma"],
  report: { assigned_level: string; ward_id: string | null },
  officerId: string,
) {
  const officer = await prisma.officers.findUnique({
    where: { id: officerId },
    include: {
      officer_departments: true,
    },
  });

  if (!officer || officer.deleted_at) {
    throw new Error("Officer not found");
  }

  if (!FIXED_DEPARTMENT_SLUGS.includes(officer.officer_departments.slug)) {
    throw new Error("Officer department is outside the fixed department catalog");
  }

  if (report.assigned_level === "ward") {
    if (officer.type !== "ward_officer") {
      throw new Error("Ward workflow reports can only be assigned to ward officers");
    }

    if (!report.ward_id || officer.ward_id !== report.ward_id) {
      throw new Error("Ward workflow reports can only be assigned within the same ward");
    }
  }

  if (
    report.assigned_level === "municipality" &&
    officer.type !== "municipality_officer"
  ) {
    throw new Error(
      "Municipality workflow reports can only be assigned to municipality officers",
    );
  }

  return officer;
}

async function fetchBoardColumns(prisma: GQLContext["prisma"], role: string) {
  const dashboardRole = role as DashboardRole;
  return prisma.kanban_columns.findMany({
    where: {
      OR: [
        { role_access: { has: dashboardRole } },
        { role_access: { isEmpty: true } },
      ],
    },
    orderBy: [{ position: "asc" }, { created_at: "asc" }],
  });
}

const reportAssignmentInclude = {
  kanban_columns: true,
  ...reportCardInclude,
} satisfies Prisma.reportsInclude;

async function loadBoardColumns(
  prisma: GQLContext["prisma"],
  authed: NonNullable<GQLContext["user"]>,
) {
  const columns = await fetchBoardColumns(prisma, authed.role);
  const workflowView = getWorkflowViewForRole(authed.role);
  const reports = await prisma.reports.findMany({
    where: buildBoardScopeWhere(authed),
    include: reportCardInclude,
    orderBy: { created_at: "desc" },
  });

  return columns.map((column) => {
    const columnReports = reports
      .filter((report) =>
        reportMatchesWorkflowColumn(
          report,
          column,
          workflowView,
          columns,
        ),
      )
      .sort((a, b) => compareReportsForColumn(column, a, b))
      .map((report) =>
        formatReportCard({
          ...report,
          kanban_column_id: resolveWorkflowColumnId(
            report,
            columns,
            workflowView,
          ),
        }),
      );

    return {
      ...column,
      reports: columnReports,
      report_count: columnReports.length,
      __workflow_view: workflowView,
    };
  });
}

async function loadSingleColumn(
  prisma: GQLContext["prisma"],
  authed: NonNullable<GQLContext["user"]>,
  id: string,
) {
  const columns = await loadBoardColumns(prisma, authed);
  const column = columns.find((item) => item.id === id);
  if (!column) throw new Error("Column not found");
  return column;
}

async function updateReportForStatus(
  prisma: GQLContext["prisma"],
  authed: NonNullable<GQLContext["user"]>,
  reportId: string,
  targetStatus: WorkflowStatus,
  options?: {
    reason?: string;
    proof_image_urls?: string[];
    activityAction?: string;
    targetColumnId?: string;
  },
) {
  const report = await prisma.reports.findUnique({
    where: { id: reportId },
    include: {
      kanban_columns: true,
      ...reportCardInclude,
    },
  });

  if (!report) throw new Error("Report not found");

  assertCanManageReport(authed, report);
  assertOwnsWorkflow(authed, report);

  const ownerWorkflow: WorkflowView =
    report.assigned_level === "municipality" ? "municipality" : "ward";
  const targetColumn = options?.targetColumnId
    ? await prisma.kanban_columns.findUnique({
        where: { id: options.targetColumnId },
      })
    : await findWorkflowColumn(prisma, ownerWorkflow, targetStatus);

  if (!targetColumn) {
    throw new Error(`No ${ownerWorkflow} column found for ${targetStatus}`);
  }

  const isColumnValidForWorkflow =
    targetColumn.mapped_status === targetStatus &&
    (targetColumn.role_access.length === 0 ||
      targetColumn.role_access.includes(ownerWorkflow as DashboardRole));

  if (!isColumnValidForWorkflow) {
    throw new Error("Target column does not match this report workflow");
  }

  const isReopenTransition =
    report.status === "completed" &&
    (targetStatus === "incoming" || targetStatus === "in_progress");

  if (targetStatus === "completed") {
    assertWorkflowAssignmentForCompletion(report);
  }

  const reason =
    targetStatus === "completed" ||
    targetStatus === "invalid" ||
    isReopenTransition
      ? requireReason(options?.reason)
      : options?.reason?.trim();
  const now = new Date();
  const nextWardActiveStartedAt =
    report.assigned_level === "ward" &&
    (targetStatus === "in_progress" || isReopenTransition)
      ? (isReopenTransition ? now : report.ward_active_started_at ?? now)
      : report.ward_active_started_at;
  const nextWardDeadlineAt =
    report.assigned_level === "ward" &&
    (targetStatus === "in_progress" || isReopenTransition)
      ? report.ward_deadline_at ?? getDefaultActiveDeadlineAt(nextWardActiveStartedAt ?? now)
      : report.ward_deadline_at;
  const nextMunicipalityDeadlineAt =
    report.assigned_level === "municipality" && targetStatus === "in_progress"
      ? report.municipality_deadline_at ?? getDefaultActiveDeadlineAt(now)
      : report.municipality_deadline_at;

  const updated = await prisma.reports.update({
    where: { id: reportId },
    data: {
      status: targetStatus,
      kanban_column_id: targetColumn.id,
      updated_at: now,
      ...(report.assigned_level === "ward" &&
        !report.incoming_seen_at && {
          incoming_seen_at: now,
        }),
      ...(report.assigned_level === "municipality" &&
        !report.municipality_seen_at && {
          municipality_seen_at: now,
        }),
      ...(report.assigned_level === "ward" &&
        nextWardActiveStartedAt && {
          ward_active_started_at: nextWardActiveStartedAt,
        }),
      ...(report.assigned_level === "ward" &&
        nextWardDeadlineAt && {
          ward_deadline_at: nextWardDeadlineAt,
        }),
      ...(report.assigned_level === "ward" &&
        isReopenTransition && {
          ward_deadline_reason: null,
        }),
      ...(report.assigned_level === "municipality" &&
        nextMunicipalityDeadlineAt && {
          municipality_deadline_at: nextMunicipalityDeadlineAt,
        }),
      ...(targetStatus === "completed" && {
        resolution_description: reason,
        resolution_photo_urls: options?.proof_image_urls ?? [],
        actual_completion_date: now,
      }),
      ...(targetStatus === "invalid" && {
        pathway_reason: reason,
        resolution_description: reason,
        resolution_photo_urls: options?.proof_image_urls ?? [],
      }),
      ...(isReopenTransition && {
        actual_completion_date: null,
        resolution_description: null,
        resolution_photo_urls: [],
      }),
      status_history: mergeWorkflowHistory(
        report.status_history,
        createWorkflowHistoryEntry({
          type: isReopenTransition ? "reopened" : "status_changed",
          actor: authed,
          fromStatus: report.status,
          toStatus: targetStatus,
          fromLevel: report.assigned_level,
          toLevel: report.assigned_level,
          note: reason,
        }),
      ) as unknown as Prisma.InputJsonValue,
    },
    include: reportCardInclude,
  });

  await prisma.activity_log.create({
    data: {
      report_id: reportId,
      actor_id: authed.id,
      actor_name: authed.email,
      action:
        options?.activityAction ??
        (isReopenTransition ? "report_reopened" : "report_status_changed"),
      details: {
        from_status: report.status,
        to_status: targetStatus,
        from_column: report.kanban_columns?.name ?? null,
        to_column: targetColumn.name,
        note: reason ?? null,
        proof_image_urls: options?.proof_image_urls ?? [],
        reopened: isReopenTransition,
        ward_deadline_at: nextWardDeadlineAt?.toISOString() ?? null,
        municipality_deadline_at: nextMunicipalityDeadlineAt?.toISOString() ?? null,
      },
    },
  });

  if (targetStatus === "completed" && report.assigned_level === "municipality") {
    const municipalityUserIds = await findMunicipalityDashboardUserIds(
      prisma,
      authed.id,
    );
    const completedBy = report.assigned_field_officer
      ? formatOfficerName(report.assigned_field_officer)
      : report.assigned_department?.name ?? authed.email;

    await notifyUsers(municipalityUserIds, {
      report_id: reportId,
      title: `Task completed by ${completedBy}`,
      message: `Task "${report.title}" was completed by ${completedBy}.`,
      type: "success",
      link: getReportLink(reportId),
      metadata: {
        eventType: "TASK_COMPLETED",
        reportId,
        completedBy,
        assignedLevel: report.assigned_level,
      },
    });
  }

  const assignedOfficerId = report.assigned_field_officer?.id ?? null;

  if (assignedOfficerId && assignedOfficerId !== authed.id) {
    if (targetStatus === "invalid") {
      await notifyOfficer(assignedOfficerId, {
        reportId,
        title: "Task assigned to you was marked invalid",
        message: `Task "${report.title}" assigned to you was marked invalid. Click to see full details.`,
        type: "task_invalidated",
        metadata: {
          eventType: "TASK_INVALIDATED",
          status: targetStatus,
          reason: reason ?? null,
          assignedLevel: report.assigned_level,
        },
      });
    } else if (targetStatus === "completed") {
      await notifyOfficer(assignedOfficerId, {
        reportId,
        title: "Task assigned to you was marked completed",
        message: `Task "${report.title}" assigned to you was marked completed. Click to see full details.`,
        type: "task_completed",
        metadata: {
          eventType: "TASK_COMPLETED",
          status: targetStatus,
          assignedLevel: report.assigned_level,
        },
      });
    } else if (targetStatus === "in_progress") {
      await notifyOfficer(assignedOfficerId, {
        reportId,
        title: "Task assigned to you moved to in progress",
        message: `Task "${report.title}" assigned to you is now in progress. Click to see full details.`,
        type: "task_status_updated",
        metadata: {
          eventType: "TASK_STATUS_UPDATED",
          status: targetStatus,
          assignedLevel: report.assigned_level,
        },
      });
    } else if (isReopenTransition) {
      await notifyOfficer(assignedOfficerId, {
        reportId,
        title: "Task assigned to you was reopened",
        message: `Task "${report.title}" assigned to you was reopened. Click to see full details.`,
        type: "task_status_updated",
        metadata: {
          eventType: "TASK_REOPENED",
          status: targetStatus,
          assignedLevel: report.assigned_level,
        },
      });
    }
  }

  // Notify the citizen who created the report
  try {
    await notifyReportOwner(prisma, report, targetStatus);
  } catch (err) {
    console.error("notifyReportOwner error:", err);
  }

  return formatReportCard(updated);
}

async function escalateReportToMunicipality(
  prisma: GQLContext["prisma"],
  authed: NonNullable<GQLContext["user"]>,
  reportId: string,
  reasonInput?: string,
) {
  const report = await prisma.reports.findUnique({
    where: { id: reportId },
    include: {
      kanban_columns: true,
      ...reportCardInclude,
    },
  });

  if (!report) throw new Error("Report not found");

  assertCanManageReport(authed, report);

  if (!["ward", "admin"].includes(authed.role)) {
    throw new Error("Only ward and admin users can escalate reports");
  }

  if (report.assigned_level !== "ward") {
    throw new Error("This report is already assigned to municipality");
  }

  const reason = requireReason(reasonInput);
  const now = new Date();
  const municipalityDeadlineAt = getDefaultActiveDeadlineAt(now);
  const municipalityColumn = await findWorkflowColumn(
    prisma,
    "municipality",
    "incoming",
  );

  if (!municipalityColumn) {
    throw new Error("Municipality escalation column is not configured");
  }

  const updated = await prisma.reports.update({
    where: { id: reportId },
    data: {
      assigned_level: "municipality",
      escalated_to_municipality: true,
      escalated_at: now,
      escalation_type: "manual",
      escalation_source: authed.role,
      municipality_received_at: now,
      municipality_deadline_at: municipalityDeadlineAt,
      pathway_type: "escalated",
      pathway_reason: reason,
      status: "incoming",
      kanban_column_id: municipalityColumn.id,
      updated_at: now,
      ...(report.assigned_level === "ward" &&
        !report.incoming_seen_at && {
          incoming_seen_at: now,
        }),
      status_history: mergeWorkflowHistory(
        report.status_history,
        {
          ...createWorkflowHistoryEntry({
            type: "escalated_to_municipality",
            actor: authed,
            fromStatus: report.status,
            toStatus: "incoming",
            fromLevel: report.assigned_level,
            toLevel: "municipality",
            note: reason,
          }),
          deadline_at: municipalityDeadlineAt.toISOString(),
          escalation_type: "manual",
          escalation_source: authed.role,
        },
      ) as unknown as Prisma.InputJsonValue,
    },
    include: reportCardInclude,
  });

  await prisma.activity_log.create({
    data: {
      report_id: reportId,
      actor_id: authed.id,
      actor_name: authed.email,
      action: "report_escalated_to_municipality",
      details: {
        from_level: report.assigned_level,
        to_level: "municipality",
        from_column: report.kanban_columns?.name ?? null,
        to_column: municipalityColumn.name,
        reason,
        municipality_deadline_at: municipalityDeadlineAt.toISOString(),
      },
    },
  });

  const municipalityUserIds = await findMunicipalityDashboardUserIds(prisma, authed.id);
  const wardName = report.wards?.name ?? "Ward";

  await notifyUsers(municipalityUserIds, {
    report_id: reportId,
    title: `Task Escalated from ${wardName}`,
    message: `Task "${report.title}" was escalated from ${wardName} with a ${DEFAULT_ACTIVE_DEADLINE_DAYS}-day deadline. Click to see full details.`,
    type: "report_assigned",
    link: getReportLink(reportId),
    metadata: {
      eventType: "REPORT_ESCALATED",
      reportId,
      wardId: report.ward_id,
      wardName,
      escalationReason: reason,
    },
  });

  await notifyOfficer(report.assigned_field_officer?.id, {
    reportId,
    title: `Task Escalated from ${wardName}`,
    message: `Task "${report.title}" assigned to you was escalated from ${wardName}. Click to see full details.`,
    type: "task_escalated",
    metadata: {
      eventType: "TASK_ESCALATED",
      wardId: report.ward_id,
      wardName,
      escalationReason: reason,
      assignedLevel: "municipality",
    },
  });

  // Notify the citizen who created the report
  if (report.user_id) {
    try {
      await createNotification({
        user_id: report.user_id,
        report_id: reportId,
        type: "report_escalated",
        title: "Your report has been escalated",
        message: `Your report "${report.title}" has been escalated to the municipality for higher-level attention.`,
        link: getReportLink(reportId),
        metadata: {
          eventType: "REPORT_ESCALATED",
          reportId,
          wardName,
        },
      });
    } catch (err) {
      console.error("notifyReportOwner escalation error:", err);
    }
  }

  return formatReportCard(updated);
}

async function returnReportToWard(
  prisma: GQLContext["prisma"],
  authed: NonNullable<GQLContext["user"]>,
  reportId: string,
  reasonInput?: string,
  instructions?: string | null,
  deadlineAtInput?: string | Date | null,
) {
  const report = await prisma.reports.findUnique({
    where: { id: reportId },
    include: {
      kanban_columns: true,
      ...reportCardInclude,
    },
  });

  if (!report) throw new Error("Report not found");

  assertCanManageReport(authed, report);

  if (!["municipality", "admin"].includes(authed.role)) {
    throw new Error("Only municipality and admin users can return reports");
  }

  if (report.assigned_level !== "municipality") {
    throw new Error("This report is not currently assigned to municipality");
  }

  const reason = requireReason(reasonInput);
  const returnedAt = new Date();
  const wardDeadlineAt = requireDeadlineAt(deadlineAtInput);

  if (wardDeadlineAt.getTime() <= returnedAt.getTime()) {
    throw new Error("The ward deadline must be after the return time");
  }

  const wardColumn = await findWorkflowColumn(prisma, "ward", "incoming");

  if (!wardColumn) {
    throw new Error("Ward incoming column is not configured");
  }

  const updated = await prisma.reports.update({
    where: { id: reportId },
    data: {
      assigned_level: "ward",
      returned_to_ward_at: returnedAt,
      return_reasoning: reason,
      return_instructions: instructions?.trim() || null,
      ward_active_started_at: returnedAt,
      ward_deadline_at: wardDeadlineAt,
      ward_deadline_reason: null,
      status: "incoming",
      kanban_column_id: wardColumn.id,
      updated_at: returnedAt,
      status_history: mergeWorkflowHistory(
        report.status_history,
        {
          ...createWorkflowHistoryEntry({
            type: "returned_to_ward",
            actor: authed,
            fromStatus: report.status,
            toStatus: "incoming",
            fromLevel: report.assigned_level,
            toLevel: "ward",
            note: reason,
            instructions: instructions?.trim() || undefined,
          }),
          deadline_at: wardDeadlineAt.toISOString(),
        },
      ) as unknown as Prisma.InputJsonValue,
    },
    include: reportCardInclude,
  });

  await prisma.activity_log.create({
    data: {
      report_id: reportId,
      actor_id: authed.id,
      actor_name: authed.email,
      action: "report_returned_to_ward",
      details: {
        from_level: report.assigned_level,
        to_level: "ward",
        from_column: report.kanban_columns?.name ?? null,
        to_column: wardColumn.name,
        reason,
        instructions: instructions?.trim() || null,
        ward_deadline_at: wardDeadlineAt.toISOString(),
      },
    },
  });

  // Create notifications for ward users
  const wardUserIds = await findWardDashboardUserIds(prisma, report.ward_id, authed.id);

  await notifyUsers(wardUserIds, {
    report_id: reportId,
    title: "Task returned by Municipality",
    message: `Task "${report.title}" was returned by Municipality. Click to see full details.${instructions ? ` Instructions: ${instructions.substring(0, 100)}` : ""}`,
    type: "report_assigned",
    link: getReportLink(reportId),
    metadata: {
      eventType: "TASK_RETURNED",
      reportId,
      returnReason: reason,
      instructions: instructions?.trim() || null,
      deadlineAt: wardDeadlineAt.toISOString(),
    },
  });

  await notifyOfficer(report.assigned_field_officer?.id, {
    reportId,
    title: "Task returned which was assigned to you",
    message: `Task "${report.title}" assigned to you was returned by Municipality. Click to see full details.`,
    type: "task_returned",
    metadata: {
      eventType: "TASK_RETURNED",
      returnReason: reason,
      instructions: instructions?.trim() || null,
      deadlineAt: wardDeadlineAt.toISOString(),
      assignedLevel: "ward",
    },
  });

  // Notify the citizen who created the report
  if (report.user_id) {
    try {
      await createNotification({
        user_id: report.user_id,
        report_id: reportId,
        type: "report_returned",
        title: "Your report is being re-reviewed",
        message: `Your report "${report.title}" has been sent back to the ward for further action.`,
        link: getReportLink(reportId),
        metadata: {
          eventType: "REPORT_RETURNED",
          reportId,
        },
      });
    } catch (err) {
      console.error("notifyReportOwner return error:", err);
    }
  }

  return formatReportCard(updated);
}

async function markReportSeen(
  prisma: GQLContext["prisma"],
  authed: NonNullable<GQLContext["user"]>,
  reportId: string,
) {
  const report = await prisma.reports.findUnique({
    where: { id: reportId },
    include: reportCardInclude,
  });

  if (!report) {
    throw new Error("Report not found");
  }

  assertCanManageReport(authed, report);

  const seenAt = new Date();
  const acknowledgingWardReport = report.assigned_level === "ward";
  const acknowledgingMunicipalityReport = report.assigned_level === "municipality";

  if (
    acknowledgingWardReport &&
    !["ward", "admin"].includes(authed.role)
  ) {
    throw new Error("Only ward and admin users can acknowledge ward incoming reports");
  }

  if (
    acknowledgingMunicipalityReport &&
    !["municipality", "admin"].includes(authed.role)
  ) {
    throw new Error(
      "Only municipality and admin users can acknowledge escalated incoming reports",
    );
  }

  if (!acknowledgingWardReport && !acknowledgingMunicipalityReport) {
    throw new Error("This report cannot be acknowledged in the current workflow");
  }

  if (acknowledgingWardReport && report.incoming_seen_at) {
    return formatReportCard(report);
  }

  if (acknowledgingMunicipalityReport && report.municipality_seen_at) {
    return formatReportCard(report);
  }

  const updated = await prisma.reports.update({
    where: { id: reportId },
    data: {
      ...(acknowledgingWardReport
        ? { incoming_seen_at: seenAt }
        : { municipality_seen_at: seenAt }),
      status_history: mergeWorkflowHistory(
        report.status_history,
        createWorkflowHistoryEntry({
          type: "acknowledged",
          actor: authed,
          fromStatus: report.status,
          toStatus: report.status,
          fromLevel: report.assigned_level,
          toLevel: report.assigned_level,
          note: acknowledgingWardReport
            ? "Viewed in ward dashboard"
            : "Viewed in municipality dashboard",
        }),
      ) as unknown as Prisma.InputJsonValue,
    },
    include: reportCardInclude,
  });

  await prisma.activity_log.create({
    data: {
      report_id: reportId,
      actor_id: authed.id,
      actor_name: authed.email,
      action: "report_acknowledged",
      details: {
        acknowledged_at: seenAt.toISOString(),
        acknowledged_level: report.assigned_level,
      },
    },
  });

  return formatReportCard(updated);
}

async function updateReportDeadline(
  prisma: GQLContext["prisma"],
  authed: NonNullable<GQLContext["user"]>,
  reportId: string,
  input: {
    deadline_at: string | Date;
    reason?: string | null;
  },
) {
  const report = await prisma.reports.findUnique({
    where: { id: reportId },
    include: {
      kanban_columns: true,
      ...reportCardInclude,
    },
  });

  if (!report) {
    throw new Error("Report not found");
  }

  assertCanManageReport(authed, report);
  assertOwnsWorkflow(authed, report);

  if (report.assigned_level !== "ward") {
    throw new Error("Only ward workflow deadlines can be updated here");
  }

  if (!report.ward_active_started_at && !report.returned_to_ward_at) {
    throw new Error("The active deadline starts once work begins on the task");
  }

  const baselineAt =
    report.ward_active_started_at ?? report.returned_to_ward_at ?? new Date();
  const deadlineAt = requireDeadlineAt(input.deadline_at);

  if (deadlineAt.getTime() <= baselineAt.getTime()) {
    throw new Error("The deadline must be after the task start time");
  }

  const reason = validateDeadlineReason({
    baselineAt,
    deadlineAt,
    reason: input.reason,
  });

  const updated = await prisma.reports.update({
    where: { id: reportId },
    data: {
      ward_deadline_at: deadlineAt,
      ward_deadline_reason: reason,
      updated_at: new Date(),
      status_history: mergeWorkflowHistory(
        report.status_history,
        {
          ...createWorkflowHistoryEntry({
            type: "deadline_updated",
            actor: authed,
            fromStatus: report.status,
            toStatus: report.status,
            fromLevel: report.assigned_level,
            toLevel: report.assigned_level,
            note: reason ?? undefined,
          }),
          previous_deadline_at: report.ward_deadline_at?.toISOString(),
          deadline_at: deadlineAt.toISOString(),
        },
      ) as unknown as Prisma.InputJsonValue,
    },
    include: reportCardInclude,
  });

  await prisma.activity_log.create({
    data: {
      report_id: reportId,
      actor_id: authed.id,
      actor_name: authed.email,
      action: "report_deadline_updated",
      details: {
        previous_deadline_at: report.ward_deadline_at?.toISOString() ?? null,
        deadline_at: deadlineAt.toISOString(),
        threshold_without_reason_at: getDeadlineReasonThresholdAt(baselineAt).toISOString(),
        reason: reason ?? null,
      },
    },
  });

  return formatReportCard(updated);
}

async function executeReportMove(
  prisma: GQLContext["prisma"],
  authed: NonNullable<GQLContext["user"]>,
  reportId: string,
  columnId: string,
  resolution?: {
    reason: string;
    proof_image_urls?: string[];
  },
) {
  const column = await prisma.kanban_columns.findUnique({
    where: { id: columnId },
  });

  if (!column) throw new Error("Target column not found");

  if (
    column.role_access.length > 0 &&
    !column.role_access.includes(authed.role as DashboardRole)
  ) {
    throw new Error("You cannot move a report into that workflow column");
  }

  if (column.mapped_status === "returned") {
    throw new Error("Use the report detail action to return a task with a new deadline");
  }

  if (
    column.is_terminal ||
    column.mapped_status === "completed" ||
    column.mapped_status === "invalid"
  ) {
    return updateReportForStatus(
      prisma,
      authed,
      reportId,
      column.mapped_status,
      {
        reason: resolution?.reason,
        proof_image_urls: resolution?.proof_image_urls,
        activityAction: "report_resolved",
        targetColumnId: column.id,
      },
    );
  }

  return updateReportForStatus(prisma, authed, reportId, column.mapped_status, {
    reason: resolution?.reason,
    proof_image_urls: resolution?.proof_image_urls,
    activityAction: "report_moved",
    targetColumnId: column.id,
  });
}

export const kanbanResolvers = {
  Query: {
    kanbanBoard: async (
      _: unknown,
      __: unknown,
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireAuth(user);
      return loadBoardColumns(prisma, authed);
    },

    kanbanColumn: async (
      _: unknown,
      { id }: { id: string },
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireAuth(user);
      return loadSingleColumn(prisma, authed, id);
    },

    kanbanUserPreferences: async (
      _: unknown,
      __: unknown,
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireAuth(user);

      let prefs = await prisma.kanban_user_preferences.findUnique({
        where: { user_id: authed.id },
      });

      if (!prefs) {
        prefs = await prisma.kanban_user_preferences.create({
          data: {
            user_id: authed.id,
            collapsed_columns: [],
          },
        });
      }

      return {
        id: prefs.id,
        user_id: prefs.user_id,
        collapsed_columns: Array.isArray(prefs.collapsed_columns)
          ? prefs.collapsed_columns
          : [],
        column_order: Array.isArray(prefs.column_order)
          ? prefs.column_order
          : null,
        created_at: prefs.created_at,
        updated_at: prefs.updated_at,
      };
    },

    reportComments: async (
      _: unknown,
      { reportId, limit }: { reportId: string; limit?: number | null },
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireAuth(user);
      const report = await prisma.reports.findUnique({
        where: { id: reportId },
        select: {
          id: true,
          ward_id: true,
          assigned_level: true,
          returned_to_ward_at: true,
        },
      });

      if (!report) {
        throw new Error("Report not found");
      }

      assertCanManageReport(authed, report);
      assertOwnsWorkflow(authed, report);

      const safeLimit = Math.min(Math.max(limit ?? 20, 1), 50);
      const comments = await prisma.comments.findMany({
        where: { report_id: reportId },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: safeLimit,
        include: {
          users: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return comments.map((comment) => ({
        id: comment.id,
        content: comment.content,
        created_at: comment.created_at,
        commenter_name: comment.users?.name ?? "Anonymous",
        commenter_id: comment.users?.id ?? null,
        is_anonymous: !comment.user_id,
      }));
    },
  },

  Mutation: {
    createKanbanColumn: async (
      _: unknown,
      {
        input,
      }: {
        input: {
          name: string;
          position: number;
          color?: string;
          deadline_days?: number | null;
          is_terminal?: boolean;
          is_default?: boolean;
          role_access?: string[];
          mapped_status: report_status;
        };
      },
      { prisma, user }: GQLContext,
    ) => {
      requireAdmin(user);

      const validStatuses: report_status[] = [
        "incoming",
        "in_progress",
        "completed",
        "returned",
        "invalid",
      ];

      if (!validStatuses.includes(input.mapped_status)) {
        throw new Error(`Invalid status: ${input.mapped_status}`);
      }

      return prisma.kanban_columns.create({
        data: {
          name: input.name,
          position: input.position,
          color: input.color ?? "#6b7280",
          deadline_days: input.deadline_days ?? null,
          is_terminal: input.is_terminal ?? false,
          is_default: input.is_default ?? false,
          role_access: (input.role_access ?? []) as user_role[],
          mapped_status: input.mapped_status,
        },
      });
    },

    updateKanbanColumn: async (
      _: unknown,
      { id, input }: { id: string; input: UpdateColumnInput },
      { prisma, user }: GQLContext,
    ) => {
      requireAdmin(user);

      const existing = await prisma.kanban_columns.findUnique({
        where: { id },
      });
      if (!existing) throw new Error("Column not found");

      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.position !== undefined) data.position = input.position;
      if (input.color !== undefined) data.color = input.color;
      if (input.deadline_days !== undefined) {
        data.deadline_days = input.deadline_days;
      }
      if (input.is_terminal !== undefined) data.is_terminal = input.is_terminal;
      if (input.mapped_status !== undefined) {
        data.mapped_status = input.mapped_status;
      }

      return prisma.kanban_columns.update({ where: { id }, data });
    },

    deleteKanbanColumn: async (
      _: unknown,
      { id }: { id: string },
      { prisma, user }: GQLContext,
    ) => {
      requireAdmin(user);

      const column = await prisma.kanban_columns.findUnique({
        where: { id },
      });

      if (column?.is_default) {
        throw new Error("Cannot delete default columns");
      }

      const count = await prisma.reports.count({
        where: { kanban_column_id: id },
      });
      if (count > 0) {
        throw new Error(`Cannot delete: ${count} report(s) in this column`);
      }

      await prisma.kanban_columns.delete({ where: { id } });
      return true;
    },

    reorderKanbanColumns: async (
      _: unknown,
      { columnIds }: { columnIds: string[] },
      { prisma, user }: GQLContext,
    ) => {
      requireAdmin(user);

      await prisma.$transaction(
        columnIds.map((id, index) =>
          prisma.kanban_columns.update({
            where: { id },
            data: { position: index },
          }),
        ),
      );

      return fetchBoardColumns(prisma, requireAuth(user).role);
    },

    moveReport: async (
      _: unknown,
      { reportId, columnId }: { reportId: string; columnId: string },
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireAuth(user);
      return executeReportMove(prisma, authed, reportId, columnId);
    },

    moveReportWithResolution: async (
      _: unknown,
      {
        reportId,
        columnId,
        resolution,
      }: {
        reportId: string;
        columnId: string;
        resolution: {
          reason: string;
          proof_image_urls?: string[];
        };
      },
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireAuth(user);
      requireReason(resolution.reason);
      return executeReportMove(prisma, authed, reportId, columnId, {
        reason: resolution.reason.trim(),
        proof_image_urls: resolution.proof_image_urls,
      });
    },

    applyReportWorkflowAction: async (
      _: unknown,
      {
        reportId,
        action,
        input,
      }: {
        reportId: string;
        action:
          | "mark_in_progress"
          | "mark_completed"
          | "mark_invalid"
          | "escalate_to_municipality"
          | "return_to_ward";
        input?: {
          reason?: string;
          instructions?: string;
          deadline_at?: string;
          proof_image_urls?: string[];
        } | null;
      },
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireAuth(user);

      switch (action) {
        case "mark_in_progress":
          return updateReportForStatus(
            prisma,
            authed,
            reportId,
            "in_progress",
            input?.reason || input?.proof_image_urls?.length
              ? {
                  reason: input?.reason,
                  proof_image_urls: input?.proof_image_urls,
                }
              : {
                  activityAction: "report_moved",
                },
          );
        case "mark_completed":
          return updateReportForStatus(prisma, authed, reportId, "completed", {
            reason: input?.reason,
            proof_image_urls: input?.proof_image_urls,
            activityAction: "report_resolved",
          });
        case "mark_invalid":
          return updateReportForStatus(prisma, authed, reportId, "invalid", {
            reason: input?.reason,
            proof_image_urls: input?.proof_image_urls,
            activityAction: "report_invalidated",
          });
        case "escalate_to_municipality":
          return escalateReportToMunicipality(
            prisma,
            authed,
            reportId,
            input?.reason,
          );
        case "return_to_ward":
          return returnReportToWard(
            prisma,
            authed,
            reportId,
            input?.reason,
            input?.instructions,
            input?.deadline_at,
          );
        default:
          throw new Error(`Unsupported workflow action: ${action}`);
      }
    },

    markReportSeen: async (
      _: unknown,
      { reportId }: { reportId: string },
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireAuth(user);
      return markReportSeen(prisma, authed, reportId);
    },

    updateReportDeadline: async (
      _: unknown,
      {
        reportId,
        input,
      }: {
        reportId: string;
        input: {
          deadline_at: string;
          reason?: string | null;
        };
      },
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireAuth(user);
      return updateReportDeadline(prisma, authed, reportId, input);
    },

    assignReport: async (
      _: unknown,
      {
        reportId,
        input,
      }: {
        reportId: string;
        input: {
          department_id?: string | null;
          officer_id?: string | null;
          priority: "low" | "medium" | "high" | "critical";
        };
      },
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireAuth(user);

      const VALID_PRIORITIES = ["low", "medium", "high", "critical"] as const;
      const nextPriority = input.priority;
      if (!VALID_PRIORITIES.includes(nextPriority)) {
        throw new Error(
          "A priority (low, medium, high, or critical) is required when assigning a report.",
        );
      }
      const report = await prisma.reports.findUnique({
        where: { id: reportId },
        include: reportAssignmentInclude,
      });

      if (!report) {
        throw new Error("Report not found");
      }

      assertCanManageReport(authed, report);
      assertOwnsWorkflow(authed, report);

      if (hasWorkflowAssignment(report)) {
        throw new Error(
          "This task is already assigned. Unassign it first before assigning a new owner.",
        );
      }

      const nextOfficerId = input.officer_id?.trim() || null;
      const nextDepartmentId = input.department_id?.trim() || null;

      if (Boolean(nextOfficerId) === Boolean(nextDepartmentId)) {
        throw new Error("Choose either an officer or a department assignment");
      }

      const nextOfficer = nextOfficerId
        ? await findAssignableOfficer(prisma, report, nextOfficerId)
        : null;
      const nextDepartment = nextOfficer
        ? nextOfficer.officer_departments
        : await findFixedDepartment(prisma, nextDepartmentId!);

      const updated = await prisma.reports.update({
        where: { id: reportId },
        data: {
          assigned_department: {
            connect: { id: nextDepartment.id },
          },
          assigned_field_officer: nextOfficer
            ? {
                connect: { id: nextOfficer.id },
              }
            : {
                disconnect: true,
              },
          category: nextDepartment.name,
          subcategory: null,
          priority: nextPriority,
          updated_at: new Date(),
        },
        include: reportCardInclude,
      });

      await prisma.activity_log.create({
        data: {
          report_id: reportId,
          actor_id: authed.id,
          actor_name: authed.email,
          action: nextOfficer
            ? "report_assigned_to_officer"
            : "report_assigned_to_department",
          details: {
            previous_department_id: report.assigned_department?.id ?? null,
            previous_department_name: report.assigned_department?.name ?? null,
            previous_officer_id: report.assigned_field_officer?.id ?? null,
            previous_officer_name: report.assigned_field_officer
              ? formatOfficerName(report.assigned_field_officer)
              : null,
            next_department_id: nextDepartment.id,
            next_department_name: nextDepartment.name,
            next_officer_id: nextOfficer?.id ?? null,
            next_officer_name: nextOfficer ? formatOfficerName(nextOfficer) : null,
            previous_category: report.category,
            next_category: nextDepartment.name,
            previous_priority: report.priority,
            next_priority: nextPriority,
            assigned_level: report.assigned_level,
          },
        },
      });

      const recipientUserIds =
        report.assigned_level === "municipality"
          ? await findMunicipalityDashboardUserIds(prisma, authed.id)
          : await findWardDashboardUserIds(prisma, report.ward_id, authed.id);

      await notifyUsers(recipientUserIds, {
        report_id: reportId,
        title: nextOfficer
          ? "Report assigned to officer"
          : "Report assigned to department",
        message: nextOfficer
          ? `Report "${report.title}" was assigned to ${formatOfficerName(nextOfficer)} in ${nextDepartment.name}.`
          : `Report "${report.title}" was assigned to the ${nextDepartment.name} department.`,
        type: "report_assigned",
        link: getReportLink(reportId),
        metadata: {
          eventType: "TASK_ASSIGNED",
          reportId,
          departmentId: nextDepartment.id,
          departmentName: nextDepartment.name,
          officerId: nextOfficer?.id ?? null,
          officerName: nextOfficer ? formatOfficerName(nextOfficer) : null,
          assignedLevel: report.assigned_level,
          priority: nextPriority,
        },
      });

      if (nextOfficer) {
        await notifyOfficer(nextOfficer.id, {
          reportId,
          title: "Task has been assigned to you",
          message: `Task "${report.title}" has been assigned to you in ${nextDepartment.name} with ${nextPriority} priority. Click to see full details.`,
          type: "task_assigned",
          metadata: {
            eventType: "TASK_ASSIGNED",
            departmentId: nextDepartment.id,
            departmentName: nextDepartment.name,
            assignedLevel: report.assigned_level,
            priority: nextPriority,
          },
        });
      }

      if (
        report.assigned_field_officer?.id &&
        report.assigned_field_officer.id !== nextOfficer?.id
      ) {
        await notifyOfficer(report.assigned_field_officer.id, {
          reportId,
          title: "Task assignment updated",
          message: nextOfficer
            ? `Task "${report.title}" was reassigned from you to ${formatOfficerName(nextOfficer)}. Click to see full details.`
            : `Task "${report.title}" is no longer assigned to you. Click to see full details.`,
          type: "task_reassigned",
          metadata: {
            eventType: "TASK_REASSIGNED",
            previousOfficerId: report.assigned_field_officer.id,
            nextOfficerId: nextOfficer?.id ?? null,
            nextOfficerName: nextOfficer ? formatOfficerName(nextOfficer) : null,
            departmentId: nextDepartment.id,
            departmentName: nextDepartment.name,
            assignedLevel: report.assigned_level,
          },
        });
      }

      return formatReportCard(updated);
    },

    unassignReport: async (
      _: unknown,
      { reportId }: { reportId: string },
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireAuth(user);
      const report = await prisma.reports.findUnique({
        where: { id: reportId },
        include: reportAssignmentInclude,
      });

      if (!report) {
        throw new Error("Report not found");
      }

      assertCanManageReport(authed, report);
      assertOwnsWorkflow(authed, report);

      if (!hasWorkflowAssignment(report)) {
        throw new Error("This task is not currently assigned");
      }

      const previousDepartment = report.assigned_department;
      const previousOfficer = report.assigned_field_officer;
      const updated = await prisma.reports.update({
        where: { id: reportId },
        data: {
          assigned_department: {
            disconnect: true,
          },
          assigned_field_officer: {
            disconnect: true,
          },
          updated_at: new Date(),
        },
        include: reportCardInclude,
      });

      await prisma.activity_log.create({
        data: {
          report_id: reportId,
          actor_id: authed.id,
          actor_name: authed.email,
          action: "report_unassigned",
          details: {
            previous_department_id: previousDepartment?.id ?? null,
            previous_department_name: previousDepartment?.name ?? null,
            previous_officer_id: previousOfficer?.id ?? null,
            previous_officer_name: previousOfficer
              ? formatOfficerName(previousOfficer)
              : null,
            assigned_level: report.assigned_level,
          },
        },
      });

      const recipientUserIds =
        report.assigned_level === "municipality"
          ? await findMunicipalityDashboardUserIds(prisma, authed.id)
          : await findWardDashboardUserIds(prisma, report.ward_id, authed.id);

      await notifyUsers(recipientUserIds, {
        report_id: reportId,
        title: "Task unassigned",
        message: `Task "${report.title}" was unassigned and no longer has an owner.`,
        type: "report_assigned",
        link: getReportLink(reportId),
        metadata: {
          eventType: "TASK_UNASSIGNED",
          reportId,
          previousDepartmentId: previousDepartment?.id ?? null,
          previousDepartmentName: previousDepartment?.name ?? null,
          previousOfficerId: previousOfficer?.id ?? null,
          previousOfficerName: previousOfficer
            ? formatOfficerName(previousOfficer)
            : null,
          assignedLevel: report.assigned_level,
        },
      });

      if (previousOfficer?.id) {
        await notifyOfficer(previousOfficer.id, {
          reportId,
          title: "Task assignment removed",
          message: `Task "${report.title}" is no longer assigned to you. Click to see full details.`,
          type: "task_reassigned",
          metadata: {
            eventType: "TASK_UNASSIGNED",
            previousOfficerId: previousOfficer.id,
            previousOfficerName: formatOfficerName(previousOfficer),
            previousDepartmentId: previousDepartment?.id ?? null,
            previousDepartmentName: previousDepartment?.name ?? null,
            assignedLevel: report.assigned_level,
          },
        });
      }

      return formatReportCard(updated);
    },

    updateKanbanPreferences: async (
      _: unknown,
      {
        input,
      }: {
        input: {
          collapsed_columns: string[];
          column_order?: string[];
        };
      },
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireAuth(user);

      const prefs = await prisma.kanban_user_preferences.upsert({
        where: { user_id: authed.id },
        create: {
          user_id: authed.id,
          collapsed_columns: input.collapsed_columns as Prisma.InputJsonValue,
          ...(input.column_order !== undefined
            ? {
                column_order: input.column_order as Prisma.InputJsonValue,
              }
            : {}),
        },
        update: {
          collapsed_columns: input.collapsed_columns as Prisma.InputJsonValue,
          ...(input.column_order !== undefined
            ? {
                column_order: input.column_order as Prisma.InputJsonValue,
              }
            : {}),
          updated_at: new Date(),
        },
      });

      return {
        id: prefs.id,
        user_id: prefs.user_id,
        collapsed_columns: Array.isArray(prefs.collapsed_columns)
          ? prefs.collapsed_columns.filter(
              (id): id is string => typeof id === "string",
            )
          : [],
        column_order: Array.isArray(prefs.column_order)
          ? prefs.column_order.filter(
              (id): id is string => typeof id === "string",
            )
          : null,
        created_at: prefs.created_at,
        updated_at: prefs.updated_at,
      };
    },

    toggleColumnCollapse: async (
      _: unknown,
      { columnId }: { columnId: string },
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireAuth(user);

      let prefs = await prisma.kanban_user_preferences.findUnique({
        where: { user_id: authed.id },
      });

      if (!prefs) {
        prefs = await prisma.kanban_user_preferences.create({
          data: {
            user_id: authed.id,
            collapsed_columns: [columnId] as Prisma.InputJsonValue,
          },
        });
      } else {
        const collapsedColumns = Array.isArray(prefs.collapsed_columns)
          ? prefs.collapsed_columns.filter(
              (id): id is string => typeof id === "string",
            )
          : [];
        const isCollapsed = collapsedColumns.includes(columnId);
        const newCollapsedColumns = isCollapsed
          ? collapsedColumns.filter((id: string) => id !== columnId)
          : [...collapsedColumns, columnId];

        prefs = await prisma.kanban_user_preferences.update({
          where: { user_id: authed.id },
          data: {
            collapsed_columns: newCollapsedColumns as Prisma.InputJsonValue,
            updated_at: new Date(),
          },
        });
      }

      return {
        id: prefs.id,
        user_id: prefs.user_id,
        collapsed_columns: Array.isArray(prefs.collapsed_columns)
          ? prefs.collapsed_columns.filter(
              (id): id is string => typeof id === "string",
            )
          : [],
        column_order: Array.isArray(prefs.column_order)
          ? prefs.column_order.filter(
              (id): id is string => typeof id === "string",
            )
          : null,
        created_at: prefs.created_at,
        updated_at: prefs.updated_at,
      };
    },
  },

  KanbanColumn: {
    reports: async (
      parent: { id: string; reports?: unknown[] },
      _: unknown,
      { prisma, user }: GQLContext,
    ) => {
      if (Array.isArray(parent.reports)) {
        return parent.reports;
      }

      const authed = requireAuth(user);
      const column = await loadSingleColumn(prisma, authed, parent.id);
      return column.reports;
    },

    report_count: async (
      parent: { id: string; report_count?: number },
      _: unknown,
      { prisma, user }: GQLContext,
    ) => {
      if (typeof parent.report_count === "number") {
        return parent.report_count;
      }

      const authed = requireAuth(user);
      const column = await loadSingleColumn(prisma, authed, parent.id);
      return column.report_count;
    },
  },
};
