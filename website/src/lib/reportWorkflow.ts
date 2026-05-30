export type WorkflowView = "ward" | "municipality" | "admin";

export type WorkflowStatus =
  | "incoming"
  | "in_progress"
  | "completed"
  | "invalid"
  | "returned";

export type WorkflowDisplayStatus =
  | "incoming"
  | "escalated"
  | "in_progress"
  | "completed"
  | "invalid"
  | "returned";

export interface WorkflowReportLike {
  status: string;
  assigned_level?: string | null;
  escalated_to_municipality?: boolean | null;
  returned_to_ward_at?: string | Date | null;
}

export interface WorkflowColumnLike {
  name: string;
  mapped_status: string;
}

export interface WorkflowHistoryEntry {
  type:
    | "status_changed"
    | "escalated_to_municipality"
    | "returned_to_ward"
    | "reopened"
    | "acknowledged"
    | "acknowledgement_overdue"
    | "deadline_updated"
    | "happiness_penalty_applied";
  at: string;
  actor_id: string;
  actor_role: string;
  actor_email: string;
  from_status?: string;
  to_status?: string;
  from_level?: string;
  to_level?: string;
  note?: string;
  instructions?: string;
  previous_deadline_at?: string;
  deadline_at?: string;
  escalation_type?: string;
  escalation_source?: string;
  penalty_points?: number;
  penalty_event_type?: string;
}

const workflowStatusLabels: Record<
  WorkflowView,
  Record<WorkflowDisplayStatus, string>
> = {
  ward: {
    incoming: "Incoming",
    escalated: "Escalated",
    in_progress: "In Progress",
    completed: "Completed",
    invalid: "Invalid",
    returned: "Returned",
  },
  municipality: {
    incoming: "Escalated",
    escalated: "Escalated",
    in_progress: "In Progress",
    completed: "Completed",
    invalid: "Invalid",
    returned: "Returned",
  },
  admin: {
    incoming: "Incoming",
    escalated: "Escalated",
    in_progress: "In Progress",
    completed: "Completed",
    invalid: "Invalid",
    returned: "Returned",
  },
};

const quickAdvanceOrder: Record<WorkflowView, WorkflowStatus[]> = {
  ward: ["incoming", "in_progress", "completed"],
  municipality: ["incoming", "in_progress", "completed"],
  admin: ["incoming", "in_progress", "completed"],
};

export function isReturnedToWard(report: WorkflowReportLike): boolean {
  return Boolean(
    report.escalated_to_municipality &&
    report.assigned_level === "ward" &&
    report.returned_to_ward_at,
  );
}

export function getWorkflowBoardStatus(
  report: WorkflowReportLike,
  view: WorkflowView,
): WorkflowStatus {
  if (
    (view === "municipality" || view === "admin") &&
    isReturnedToWard(report)
  ) {
    return "returned";
  }

  if (
    report.status === "incoming" ||
    report.status === "in_progress" ||
    report.status === "completed" ||
    report.status === "invalid" ||
    report.status === "returned"
  ) {
    return report.status;
  }

  return "incoming";
}

export function getWorkflowDisplayStatus(
  report: WorkflowReportLike,
  view: WorkflowView,
): WorkflowDisplayStatus {
  const boardStatus = getWorkflowBoardStatus(report, view);

  if (view === "municipality" && boardStatus === "incoming") {
    return "escalated";
  }

  return boardStatus;
}

export function getWorkflowStatusLabel(
  report: WorkflowReportLike,
  view: WorkflowView,
): string {
  const displayStatus = getWorkflowDisplayStatus(report, view);
  return workflowStatusLabels[view][displayStatus];
}

export function getWorkflowColumnLabel(
  column: WorkflowColumnLike,
  view: WorkflowView,
): string {
  // const mappedStatus =
  //   column.mapped_status === "incoming" ||
  //   column.mapped_status === "in_progress" ||
  //   column.mapped_status === "completed" ||
  //   column.mapped_status === "invalid" ||
  //   column.mapped_status === "returned"
  //     ? (column.mapped_status as WorkflowStatus)
  //     : "incoming";

  // if (view === "municipality" && mappedStatus === "incoming") {
  //   return workflowStatusLabels[view].escalated;
  // }

  // return workflowStatusLabels[view][mappedStatus];
  return column.name;
}

export function getNextWorkflowStatus(
  currentStatus: string,
  view: WorkflowView,
): WorkflowStatus | null {
  const order = quickAdvanceOrder[view];
  const currentIndex = order.indexOf(currentStatus as WorkflowStatus);

  if (currentIndex === -1 || currentIndex === order.length - 1) {
    return null;
  }

  return order[currentIndex + 1];
}

export function appendWorkflowHistory(
  currentHistory: unknown,
  entry: WorkflowHistoryEntry,
): WorkflowHistoryEntry[] {
  const history = Array.isArray(currentHistory) ? currentHistory : [];

  return [
    ...history.filter((item): item is WorkflowHistoryEntry =>
      Boolean(item && typeof item === "object"),
    ),
    entry,
  ];
}

export function buildSystemActor() {
  return {
    id: "system",
    role: "system",
    email: "system@workflow.local",
  };
}

export interface WorkflowDeadlineLike {
  assigned_level: "ward" | "municipality";
  status: string;
  incoming_ack_deadline_at?: string | Date | null;
  ward_active_started_at?: string | Date | null;
  ward_deadline_at?: string | Date | null;
  municipality_received_at?: string | Date | null;
  municipality_seen_at?: string | Date | null;
  municipality_deadline_at?: string | Date | null;
}

export function getReportDeadlineAt(
  report: WorkflowDeadlineLike,
): string | Date | null {
  if (report.assigned_level === "municipality") {
    if (
      report.status === "incoming" &&
      report.municipality_received_at &&
      !report.municipality_seen_at
    ) {
      const receivedAt = new Date(report.municipality_received_at);
      return Number.isNaN(receivedAt.getTime())
        ? null
        : new Date(receivedAt.getTime() + 24 * 60 * 60 * 1000);
    }

    return report.municipality_deadline_at ?? null;
  }

  if (
    report.status === "incoming" &&
    !report.ward_active_started_at &&
    report.incoming_ack_deadline_at
  ) {
    return report.incoming_ack_deadline_at;
  }

  return report.ward_deadline_at ?? report.incoming_ack_deadline_at ?? null;
}

function isWorkflowHistoryEntry(value: unknown): value is WorkflowHistoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<WorkflowHistoryEntry>;
  return (
    typeof entry.type === "string" &&
    typeof entry.at === "string" &&
    typeof entry.actor_id === "string" &&
    typeof entry.actor_role === "string" &&
    typeof entry.actor_email === "string"
  );
}

export function getWorkflowHistoryEntries(
  history: unknown,
): WorkflowHistoryEntry[] {
  return Array.isArray(history) ? history.filter(isWorkflowHistoryEntry) : [];
}

export function getLatestReopenEntry(
  history: unknown,
  options?: { after?: string | Date | null },
): WorkflowHistoryEntry | null {
  const afterTimestamp = options?.after
    ? new Date(options.after).getTime()
    : Number.NEGATIVE_INFINITY;

  const matches = getWorkflowHistoryEntries(history).filter((entry) => {
    const entryTimestamp = new Date(entry.at).getTime();
    const isLegacyReopen =
      entry.type === "status_changed" &&
      entry.from_status === "completed" &&
      (entry.to_status === "incoming" || entry.to_status === "in_progress");

    return (
      Number.isFinite(entryTimestamp) &&
      entryTimestamp > afterTimestamp &&
      (entry.type === "reopened" || isLegacyReopen)
    );
  });

  return matches.at(-1) ?? null;
}
