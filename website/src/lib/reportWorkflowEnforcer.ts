import { Prisma } from "@/app/generated/prisma/client";
import type { GQLContext } from "@/src/graphql/context";
import {
  createSystemWorkflowHistoryEntry,
  findWorkflowColumn,
  mergeWorkflowHistory,
} from "@/src/lib/reportWorkflowServer";
import {
  DEFAULT_ACTIVE_DEADLINE_DAYS,
  HAPPINESS_PENALTIES,
  REPORT_NOT_SEEN_DAYS,
  addDays,
  getMunicipalityEscalationAckDeadlineAt,
  getDefaultActiveDeadlineAt,
} from "@/src/lib/reportTimeline";

type PrismaClientLike = GQLContext["prisma"];
type PrismaTransactionLike = Prisma.TransactionClient;

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function formatRemainingWindow(targetAt: Date, now: Date) {
  const diffMs = targetAt.getTime() - now.getTime();
  const diffHours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));

  if (diffHours >= 24) {
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? "" : "s"}`;
  }

  return `${diffHours} hour${diffHours === 1 ? "" : "s"}`;
}

async function createNotifications(
  prisma: PrismaClientLike | PrismaTransactionLike,
  userIds: string[],
  payload: {
    reportId?: string | null;
    title: string;
    message: string;
    type?: string;
    link?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  const targets = unique(userIds);

  for (const userId of targets) {
    await prisma.notifications.create({
      data: {
        user_id: userId,
        report_id: payload.reportId ?? null,
        title: payload.title,
        message: payload.message,
        type: payload.type ?? "warning",
        link:
          payload.link ??
          (payload.reportId ? `/reports/${payload.reportId}` : null),
        metadata: (payload.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}

async function findWardDashboardUserIds(
  prisma: PrismaClientLike | PrismaTransactionLike,
  wardId: string | null,
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
    },
    select: { id: true },
  });

  return users.map((user) => user.id);
}

async function findMunicipalityDashboardUserIds(
  prisma: PrismaClientLike | PrismaTransactionLike,
) {
  const users = await prisma.users.findMany({
    where: {
      role: { in: ["municipality", "admin"] },
      is_active: true,
      deleted_at: null,
    },
    select: { id: true },
  });

  return users.map((user) => user.id);
}

async function createWardHappinessEvent(
  tx: PrismaTransactionLike,
  params: {
    eventKey: string;
    wardId: string;
    reportId: string;
    eventType: string;
    penaltyPoints: number;
    details: Prisma.InputJsonValue;
  },
) {
  const existing = await tx.ward_happiness_events.findUnique({
    where: { event_key: params.eventKey },
    select: { id: true },
  });

  if (existing) {
    return false;
  }

  await tx.ward_happiness_events.create({
    data: {
      event_key: params.eventKey,
      ward_id: params.wardId,
      report_id: params.reportId,
      event_type: params.eventType,
      penalty_points: params.penaltyPoints,
      details: params.details,
    },
  });

  return true;
}

async function applyIncomingNotSeenPenalties(
  prisma: PrismaClientLike,
  now: Date,
) {
  const reports = await prisma.reports.findMany({
    where: {
      ward_id: { not: null },
      assigned_level: "ward",
      status: "incoming",
      incoming_seen_at: null,
      incoming_ack_deadline_at: { lte: now },
      escalated_to_municipality: false,
      returned_to_ward_at: null,
    },
    select: {
      id: true,
      title: true,
      ward_id: true,
      incoming_ack_deadline_at: true,
      status_history: true,
      status: true,
      assigned_level: true,
      incoming_seen_at: true,
      escalated_to_municipality: true,
      returned_to_ward_at: true,
    },
  });

  for (const report of reports) {
    const eventKey = `report:${report.id}:incoming-not-seen-24h`;

    const result = await prisma.$transaction(async (tx) => {
      if (!report.ward_id) {
        return null;
      }

      const current = await tx.reports.findUnique({
        where: { id: report.id },
        select: {
          id: true,
          title: true,
          ward_id: true,
          status: true,
          assigned_level: true,
          incoming_seen_at: true,
          incoming_ack_deadline_at: true,
          escalated_to_municipality: true,
          returned_to_ward_at: true,
          status_history: true,
        },
      });

      if (
        !current ||
        !current.ward_id ||
        current.assigned_level !== "ward" ||
        current.status !== "incoming" ||
        current.incoming_seen_at ||
        current.escalated_to_municipality ||
        current.returned_to_ward_at ||
        !current.incoming_ack_deadline_at ||
        current.incoming_ack_deadline_at.getTime() > now.getTime()
      ) {
        return null;
      }

      const created = await createWardHappinessEvent(tx, {
        eventKey,
        wardId: current.ward_id,
        reportId: current.id,
        eventType: "incoming_not_seen_24h",
        penaltyPoints: HAPPINESS_PENALTIES.incoming_not_seen_24h,
        details: {
          threshold: "24_hours",
          acknowledged_deadline_at: current.incoming_ack_deadline_at.toISOString(),
        },
      });

      if (!created) {
        return null;
      }

      await tx.reports.update({
        where: { id: current.id },
        data: {
          status_history: mergeWorkflowHistory(
            current.status_history,
            createSystemWorkflowHistoryEntry({
              type: "happiness_penalty_applied",
              note: "Ward did not acknowledge the incoming task within 24 hours.",
              penaltyPoints: HAPPINESS_PENALTIES.incoming_not_seen_24h,
              penaltyEventType: "incoming_not_seen_24h",
            }),
          ) as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.activity_log.create({
        data: {
          report_id: current.id,
          actor_name: "Workflow automation",
          action: "ward_happiness_penalty_applied",
          details: {
            event_key: eventKey,
            event_type: "incoming_not_seen_24h",
            penalty_points: HAPPINESS_PENALTIES.incoming_not_seen_24h,
          },
        },
      });

      return {
        reportId: current.id,
        title: current.title,
        wardId: current.ward_id,
      };
    });

    if (!result) {
      continue;
    }

    const wardUserIds = await findWardDashboardUserIds(prisma, result.wardId);
    await createNotifications(prisma, wardUserIds, {
      reportId: result.reportId,
      title: "Incoming task missed acknowledgement window",
      message: `Report "${result.title}" was not acknowledged within 24 hours, and ward happiness was reduced.`,
      type: "warning",
      link: `/reports/${result.reportId}`,
      metadata: {
        eventType: "TASK_ACKNOWLEDGEMENT_OVERDUE",
        reportId: result.reportId,
      },
    });
  }
}

async function autoEscalateReport(
  prisma: PrismaClientLike,
  reportId: string,
  params: {
    escalationType: "report_not_seen" | "deadline_missed";
    escalationReason: string;
    penaltyPoints: number;
    eventKey: string;
    titleFallback: string;
  },
) {
  const now = new Date();
  const municipalityDeadlineAt = getDefaultActiveDeadlineAt(now);
  const municipalityColumn = await findWorkflowColumn(
    prisma,
    "municipality",
    "incoming",
  );

  if (!municipalityColumn) {
    return null;
  }

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.reports.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        title: true,
        ward_id: true,
        status: true,
        assigned_level: true,
        incoming_seen_at: true,
        ward_deadline_at: true,
        escalated_to_municipality: true,
        returned_to_ward_at: true,
        kanban_column_id: true,
        status_history: true,
      },
    });

    if (
      !current ||
      !current.ward_id ||
      current.assigned_level !== "ward" ||
      current.escalated_to_municipality
    ) {
      return null;
    }

    if (
      params.escalationType === "report_not_seen" &&
      (current.status !== "incoming" || current.returned_to_ward_at)
    ) {
      return null;
    }

    if (
      params.escalationType === "deadline_missed" &&
      (!current.ward_deadline_at ||
        current.ward_deadline_at.getTime() >= now.getTime() ||
        current.status === "completed" ||
        current.status === "invalid")
    ) {
      return null;
    }

    const created = await createWardHappinessEvent(tx, {
      eventKey: params.eventKey,
      wardId: current.ward_id,
      reportId: current.id,
      eventType: params.escalationType,
      penaltyPoints: params.penaltyPoints,
      details: {
        escalation_type: params.escalationType,
        escalation_reason: params.escalationReason,
      },
    });

    if (!created) {
      return null;
    }

    const updated = await tx.reports.update({
      where: { id: current.id },
      data: {
        assigned_level: "municipality",
        escalated_to_municipality: true,
        escalated_at: now,
        escalation_type: params.escalationType,
        escalation_source: "system",
        municipality_received_at: now,
        municipality_deadline_at: municipalityDeadlineAt,
        pathway_type: "escalated",
        pathway_reason: params.escalationReason,
        status: "incoming",
        kanban_column_id: municipalityColumn.id,
        status_history: mergeWorkflowHistory(
          mergeWorkflowHistory(
            current.status_history,
            createSystemWorkflowHistoryEntry({
              type: "escalated_to_municipality",
              fromStatus: current.status,
              toStatus: "incoming",
              fromLevel: current.assigned_level,
              toLevel: "municipality",
              note: params.escalationReason,
              deadlineAt: municipalityDeadlineAt,
              escalationType: params.escalationType,
              escalationSource: "system",
            }),
          ),
          createSystemWorkflowHistoryEntry({
            type: "happiness_penalty_applied",
            note: `${params.escalationReason}. Ward happiness was reduced.`,
            penaltyPoints: params.penaltyPoints,
            penaltyEventType: params.escalationType,
          }),
        ) as unknown as Prisma.InputJsonValue,
      },
    });

    await tx.activity_log.create({
      data: {
        report_id: current.id,
        actor_name: "Workflow automation",
        action: "report_escalated_to_municipality_automatically",
        details: {
          escalation_type: params.escalationType,
          escalation_reason: params.escalationReason,
          event_key: params.eventKey,
          penalty_points: params.penaltyPoints,
          municipality_deadline_at: municipalityDeadlineAt.toISOString(),
        },
      },
    });

    return {
      reportId: updated.id,
      title: updated.title || params.titleFallback,
      wardId: current.ward_id,
    };
  });

  if (!result) {
    return null;
  }

  const [municipalityUserIds, wardUserIds] = await Promise.all([
    findMunicipalityDashboardUserIds(prisma),
    findWardDashboardUserIds(prisma, result.wardId),
  ]);
  const ward = result.wardId
    ? await prisma.wards.findUnique({
        where: { id: result.wardId },
        select: { name: true },
      })
    : null;
  const wardName = ward?.name ?? "Ward";

  await createNotifications(prisma, municipalityUserIds, {
    reportId: result.reportId,
    title: `Task Escalated from ${wardName}`,
    message: `Task "${result.title}" was escalated from ${wardName}. ${params.escalationReason}. Click to see full details.`,
    type: "warning",
    link: `/reports/${result.reportId}`,
    metadata: {
      eventType: "REPORT_ESCALATED",
      reportId: result.reportId,
      wardId: result.wardId,
      wardName,
      escalationType: params.escalationType,
      escalationReason: params.escalationReason,
    },
  });

  await createNotifications(prisma, wardUserIds, {
    reportId: result.reportId,
    title: "Task escalated to Municipality",
    message: `Task "${result.title}" was escalated to Municipality. ${params.escalationReason}. Click to see full details.`,
    type: "warning",
    link: `/reports/${result.reportId}`,
    metadata: {
      eventType: "REPORT_ESCALATED",
      reportId: result.reportId,
      wardId: result.wardId,
      wardName,
      escalationType: params.escalationType,
      escalationReason: params.escalationReason,
    },
  });

  return result;
}

async function autoEscalateReportNotSeen(
  prisma: PrismaClientLike,
  now: Date,
) {
  const escalationThreshold = addDays(now, -REPORT_NOT_SEEN_DAYS);

  const reports = await prisma.reports.findMany({
    where: {
      ward_id: { not: null },
      assigned_level: "ward",
      status: "incoming",
      escalated_to_municipality: false,
      returned_to_ward_at: null,
      created_at: { lte: escalationThreshold },
    },
    select: {
      id: true,
      title: true,
    },
  });

  for (const report of reports) {
    await autoEscalateReport(prisma, report.id, {
      escalationType: "report_not_seen",
      escalationReason: "Report not seen",
      penaltyPoints: HAPPINESS_PENALTIES.report_not_seen_escalation,
      eventKey: `report:${report.id}:escalation-report-not-seen`,
      titleFallback: report.title,
    });
  }
}

async function autoEscalateDeadlineMisses(
  prisma: PrismaClientLike,
  now: Date,
) {
  const reports = await prisma.reports.findMany({
    where: {
      ward_id: { not: null },
      assigned_level: "ward",
      ward_deadline_at: { lt: now },
      status: { notIn: ["completed", "invalid"] },
    },
    select: {
      id: true,
      title: true,
      ward_deadline_at: true,
    },
  });

  for (const report of reports) {
    if (!report.ward_deadline_at) {
      continue;
    }

    await autoEscalateReport(prisma, report.id, {
      escalationType: "deadline_missed",
      escalationReason: "Deadline missed",
      penaltyPoints: HAPPINESS_PENALTIES.deadline_missed_escalation,
      eventKey: `report:${report.id}:escalation-deadline-missed:${report.ward_deadline_at.toISOString()}`,
      titleFallback: report.title,
    });
  }
}

async function sendDeadlineWarnings(
  prisma: PrismaClientLike,
  now: Date,
) {
  const warningThreshold = new Date(now.getTime() + 60 * 60 * 1000);
  const reports = await prisma.reports.findMany({
    where: {
      status: { notIn: ["completed", "invalid"] },
      OR: [
        {
          assigned_level: "ward",
          ward_deadline_at: {
            gt: now,
            lte: warningThreshold,
          },
        },
        {
          assigned_level: "municipality",
          municipality_deadline_at: {
            gt: now,
            lte: warningThreshold,
          },
        },
      ],
    },
    select: {
      id: true,
      title: true,
      ward_id: true,
      assigned_level: true,
      ward_deadline_at: true,
      municipality_deadline_at: true,
      status: true,
    },
  });

  for (const report of reports) {
    const deadlineAt =
      report.assigned_level === "ward"
        ? report.ward_deadline_at
        : report.municipality_deadline_at;

    if (!deadlineAt) {
      continue;
    }

    const action = `task_deadline_warning_sent:${report.assigned_level}:${deadlineAt.toISOString()}`;
    const userIds =
      report.assigned_level === "municipality"
        ? await findMunicipalityDashboardUserIds(prisma)
        : await findWardDashboardUserIds(prisma, report.ward_id);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.activity_log.findFirst({
        where: {
          report_id: report.id,
          action,
        },
        select: { id: true },
      });

      if (existing) {
        return;
      }

      await createNotifications(tx, userIds, {
        reportId: report.id,
        title: "1 hour left. Your happiness score may decrease",
        message: `Task "${report.title}" reaches its deadline in about 1 hour.`,
        type: "warning",
        metadata: {
          eventType: "TASK_EXPIRY_WARNING",
          reportId: report.id,
          assignedLevel: report.assigned_level,
          deadlineAt: deadlineAt.toISOString(),
        },
      });

      await tx.activity_log.create({
        data: {
          report_id: report.id,
          actor_name: "Workflow automation",
          action,
          details: {
            warning_type: "task_expiry",
            assigned_level: report.assigned_level,
            deadline_at: deadlineAt.toISOString(),
          },
        },
      });
    });
  }
}

async function sendEscalationWarnings(
  prisma: PrismaClientLike,
  now: Date,
) {
  const lowerBound = addDays(now, -REPORT_NOT_SEEN_DAYS);
  const upperBound = addDays(now, -(REPORT_NOT_SEEN_DAYS - 1));

  const reports = await prisma.reports.findMany({
    where: {
      ward_id: { not: null },
      assigned_level: "ward",
      status: "incoming",
      escalated_to_municipality: false,
      returned_to_ward_at: null,
      created_at: {
        gt: lowerBound,
        lte: upperBound,
      },
    },
    select: {
      id: true,
      title: true,
      ward_id: true,
      created_at: true,
    },
  });

  for (const report of reports) {
    const escalationAt = addDays(report.created_at, REPORT_NOT_SEEN_DAYS);
    const action = `task_escalation_warning_sent:${escalationAt.toISOString()}`;
    const remaining = formatRemainingWindow(escalationAt, now);
    const wardUserIds = await findWardDashboardUserIds(prisma, report.ward_id);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.activity_log.findFirst({
        where: {
          report_id: report.id,
          action,
        },
        select: { id: true },
      });

      if (existing) {
        return;
      }

      await createNotifications(tx, wardUserIds, {
        reportId: report.id,
        title: `This task will be escalated in ${remaining}`,
        message: `Task "${report.title}" will be escalated to municipality in ${remaining} unless it is acted on.`,
        type: "warning",
        metadata: {
          eventType: "TASK_ESCALATION_WARNING",
          reportId: report.id,
          escalatesAt: escalationAt.toISOString(),
        },
      });

      await tx.activity_log.create({
        data: {
          report_id: report.id,
          actor_name: "Workflow automation",
          action,
          details: {
            warning_type: "task_escalation",
            escalates_at: escalationAt.toISOString(),
          },
        },
      });
    });
  }
}

async function remindMunicipalityEscalationsNotSeen(
  prisma: PrismaClientLike,
  now: Date,
) {
  const reports = await prisma.reports.findMany({
    where: {
      assigned_level: "municipality",
      status: "incoming",
      escalated_to_municipality: true,
      municipality_seen_at: null,
      municipality_received_at: { lte: now },
    },
    select: {
      id: true,
      title: true,
      municipality_received_at: true,
    },
  });

  for (const report of reports) {
    const acknowledgementDeadlineAt = getMunicipalityEscalationAckDeadlineAt(
      report.municipality_received_at,
    );

    if (acknowledgementDeadlineAt.getTime() > now.getTime()) {
      continue;
    }

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.reports.findUnique({
        where: { id: report.id },
        select: {
          id: true,
          title: true,
          status: true,
          assigned_level: true,
          escalated_to_municipality: true,
          municipality_received_at: true,
          municipality_seen_at: true,
          status_history: true,
        },
      });

      if (
        !current ||
        current.assigned_level !== "municipality" ||
        current.status !== "incoming" ||
        !current.escalated_to_municipality ||
        current.municipality_seen_at
      ) {
        return null;
      }

      const deadlineAt = getMunicipalityEscalationAckDeadlineAt(
        current.municipality_received_at,
      );

      if (deadlineAt.getTime() > now.getTime()) {
        return null;
      }

      const existingReminder = await tx.activity_log.findFirst({
        where: {
          report_id: current.id,
          action: "municipality_acknowledgement_overdue",
        },
        select: { id: true },
      });

      if (existingReminder) {
        return null;
      }

      await tx.reports.update({
        where: { id: current.id },
        data: {
          status_history: mergeWorkflowHistory(
            current.status_history,
            createSystemWorkflowHistoryEntry({
              type: "acknowledgement_overdue",
              fromStatus: current.status,
              toStatus: current.status,
              fromLevel: current.assigned_level,
              toLevel: current.assigned_level,
              note: "Municipality did not acknowledge the escalated task within 24 hours.",
              deadlineAt,
            }),
          ) as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.activity_log.create({
        data: {
          report_id: current.id,
          actor_name: "Workflow automation",
          action: "municipality_acknowledgement_overdue",
          details: {
            acknowledgement_deadline_at: deadlineAt.toISOString(),
            municipality_received_at:
              current.municipality_received_at.toISOString(),
          },
        },
      });

      return {
        reportId: current.id,
        title: current.title,
      };
    });

    if (!result) {
      continue;
    }

    const municipalityUserIds = await findMunicipalityDashboardUserIds(prisma);
    await createNotifications(prisma, municipalityUserIds, {
      reportId: result.reportId,
      title: "Escalated task missed acknowledgement window",
      message: `Report "${result.title}" was not acknowledged by municipality within 24 hours of escalation.`,
      type: "warning",
      link: `/reports/${result.reportId}`,
      metadata: {
        eventType: "TASK_ACKNOWLEDGEMENT_OVERDUE",
        reportId: result.reportId,
      },
    });
  }
}

export async function enforceReportWorkflowAutomation(prisma: PrismaClientLike) {
  const now = new Date();

  await sendEscalationWarnings(prisma, now);
  await sendDeadlineWarnings(prisma, now);
  await applyIncomingNotSeenPenalties(prisma, now);
  await autoEscalateReportNotSeen(prisma, now);
  await autoEscalateDeadlineMisses(prisma, now);
  await remindMunicipalityEscalationsNotSeen(prisma, now);
}

export async function getWardHappinessMetrics(
  prisma: PrismaClientLike,
  wardIds: string[],
) {
  const ids = unique(wardIds);

  if (ids.length === 0) {
    return new Map<
      string,
      {
        totalPenaltyPoints: number;
        happinessScore: number;
        incomingNotSeenCount: number;
        reportNotSeenEscalationCount: number;
        deadlineMissedEscalationCount: number;
      }
    >();
  }

  const events = await prisma.ward_happiness_events.findMany({
    where: {
      ward_id: { in: ids },
    },
    select: {
      ward_id: true,
      event_type: true,
      penalty_points: true,
    },
  });

  const metrics = new Map<
    string,
    {
      totalPenaltyPoints: number;
      happinessScore: number;
      incomingNotSeenCount: number;
      reportNotSeenEscalationCount: number;
      deadlineMissedEscalationCount: number;
    }
  >();

  for (const wardId of ids) {
    metrics.set(wardId, {
      totalPenaltyPoints: 0,
      happinessScore: 100,
      incomingNotSeenCount: 0,
      reportNotSeenEscalationCount: 0,
      deadlineMissedEscalationCount: 0,
    });
  }

  for (const event of events) {
    const current = metrics.get(event.ward_id);

    if (!current) {
      continue;
    }

    current.totalPenaltyPoints += event.penalty_points;

    if (event.event_type === "incoming_not_seen_24h") {
      current.incomingNotSeenCount += 1;
    }

    if (event.event_type === "report_not_seen") {
      current.reportNotSeenEscalationCount += 1;
    }

    if (event.event_type === "deadline_missed") {
      current.deadlineMissedEscalationCount += 1;
    }
  }

  for (const entry of metrics.values()) {
    entry.happinessScore = Math.max(0, 100 - entry.totalPenaltyPoints);
  }

  return metrics;
}

export function getDefaultMunicipalityDeadlineAt(referenceAt: Date) {
  return getDefaultActiveDeadlineAt(referenceAt);
}

export function getDefaultWardDeadlineAt(referenceAt: Date) {
  return getDefaultActiveDeadlineAt(referenceAt);
}

export { DEFAULT_ACTIVE_DEADLINE_DAYS };
