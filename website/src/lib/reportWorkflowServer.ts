import type { GQLContext } from "@/src/graphql/context";
import {
  appendWorkflowHistory,
  buildSystemActor,
  getWorkflowBoardStatus,
  type WorkflowHistoryEntry,
  type WorkflowStatus,
  type WorkflowView,
} from "@/src/lib/reportWorkflow";

export const reportCardInclude = {
  assigned_department: {
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      created_at: true,
      updated_at: true,
    },
  },
  assigned_field_officer: {
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      phone_number: true,
      type: true,
      department_id: true,
      officer_departments: {
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          created_at: true,
          updated_at: true,
        },
      },
    },
  },
  wards: {
    select: { id: true, name: true, ward_code: true },
  },
  report_post: {
    select: {
      id: true,
      rating_average: true,
      rating_count: true,
      comment_count: true,
      bookmark_count: true,
      edited_count: true,
      completed_at: true,
      updated_at: true,
    },
  },
} as const;

export function getWorkflowViewForRole(role: string): WorkflowView {
  if (role === "municipality") return "municipality";
  if (role === "admin") return "admin";
  return "ward";
}

interface ReportCardSource {
  id: string;
  title: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  status: string;
  priority: string;
  upvote_count: number;
  comment_count: number;
  is_public: boolean;
  media_url: string | null;
  photo_urls: unknown;
  address_text: string | null;
  location_lat: number | null;
  location_lng: number | null;
  submitted_at: Date;
  created_at: Date;
  updated_at: Date;
  incoming_seen_at: Date | null;
  incoming_ack_deadline_at: Date | null;
  ward_active_started_at: Date | null;
  ward_deadline_at: Date | null;
  municipality_received_at: Date | null;
  municipality_seen_at: Date | null;
  estimated_completion_date: Date | null;
  kanban_column_id: string | null;
  ward_id: string | null;
  assigned_department_id?: string | null;
  assigned_field_officer_id?: string | null;
  assigned_level: string;
  escalated_to_municipality: boolean;
  escalated_at: Date | null;
  escalation_type: string | null;
  escalation_source: string | null;
  returned_to_ward_at: Date | null;
  municipality_deadline_at: Date | null;
  ward_deadline_reason: string | null;
  pathway_reason: string | null;
  return_reasoning: string | null;
  return_instructions: string | null;
  status_history: unknown;
  resolution_description: string | null;
  resolution_photo_urls: unknown;
  actual_completion_date?: Date | null;
  assigned_department?: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    created_at: Date;
    updated_at: Date;
  } | null;
  assigned_field_officer?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone_number: string | null;
    type: string;
    department_id: string;
    officer_departments: {
      id: string;
      slug: string;
      name: string;
      description: string | null;
      created_at: Date;
      updated_at: Date;
    };
  } | null;
  wards?: {
    id: string;
    name: string;
    ward_code: string;
  } | null;
  report_post?: {
    id: string;
    rating_average: number;
    rating_count: number;
    comment_count: number;
    bookmark_count: number;
    edited_count: number;
    completed_at: Date;
    updated_at: Date;
  } | null;
}

export function formatReportCard(report: ReportCardSource) {
  return {
    id: report.id,
    title: report.title,
    description: report.description,
    category: report.category,
    subcategory: report.subcategory,
    status: report.status,
    priority: report.priority,
    upvote_count: report.upvote_count,
    comment_count: report.comment_count,
    is_public: report.is_public,
    media_url: report.media_url,
    photo_urls: report.photo_urls,
    address_text: report.address_text,
    location_lat: report.location_lat,
    location_lng: report.location_lng,
    submitted_at: report.submitted_at,
    created_at: report.created_at,
    updated_at: report.updated_at,
    incoming_seen_at: report.incoming_seen_at,
    incoming_ack_deadline_at: report.incoming_ack_deadline_at,
    ward_active_started_at: report.ward_active_started_at,
    ward_deadline_at: report.ward_deadline_at,
    municipality_received_at: report.municipality_received_at,
    municipality_seen_at: report.municipality_seen_at,
    estimated_completion_date: report.estimated_completion_date,
    kanban_column_id: report.kanban_column_id,
    ward_id: report.ward_id,
    assigned_department_id: report.assigned_department_id ?? null,
    assigned_field_officer_id: report.assigned_field_officer_id ?? null,
    assigned_level: report.assigned_level,
    escalated_to_municipality: report.escalated_to_municipality,
    escalated_at: report.escalated_at,
    escalation_type: report.escalation_type,
    escalation_source: report.escalation_source,
    returned_to_ward_at: report.returned_to_ward_at,
    municipality_deadline_at: report.municipality_deadline_at,
    ward_deadline_reason: report.ward_deadline_reason,
    pathway_reason: report.pathway_reason,
    return_reasoning: report.return_reasoning,
    return_instructions: report.return_instructions,
    status_history: report.status_history,
    resolution_description: report.resolution_description,
    resolution_photo_urls: report.resolution_photo_urls,
    actual_completion_date: report.actual_completion_date,
    assigned_department: report.assigned_department
      ? {
          id: report.assigned_department.id,
          slug: report.assigned_department.slug,
          name: report.assigned_department.name,
          description: report.assigned_department.description,
          created_at: report.assigned_department.created_at,
          updated_at: report.assigned_department.updated_at,
        }
      : null,
    assigned_officer: report.assigned_field_officer
      ? {
          id: report.assigned_field_officer.id,
          name: [
            report.assigned_field_officer.first_name,
            report.assigned_field_officer.last_name,
          ]
            .filter(Boolean)
            .join(" ")
            .trim(),
          email: report.assigned_field_officer.email,
          phone_number: report.assigned_field_officer.phone_number,
          type: report.assigned_field_officer.type,
          department: {
            id: report.assigned_field_officer.officer_departments.id,
            slug: report.assigned_field_officer.officer_departments.slug,
            name: report.assigned_field_officer.officer_departments.name,
            description:
              report.assigned_field_officer.officer_departments.description,
            created_at:
              report.assigned_field_officer.officer_departments.created_at,
            updated_at:
              report.assigned_field_officer.officer_departments.updated_at,
          },
        }
      : null,
    ward: report.wards
      ? {
          id: report.wards.id,
          name: report.wards.name,
          ward_code: report.wards.ward_code,
        }
      : null,
    report_post: report.report_post
      ? {
          id: report.report_post.id,
          rating_average: report.report_post.rating_average,
          rating_count: report.report_post.rating_count,
          comment_count: report.report_post.comment_count,
          bookmark_count: report.report_post.bookmark_count,
          edited_count: report.report_post.edited_count,
          completed_at: report.report_post.completed_at,
          updated_at: report.report_post.updated_at,
        }
      : null,
  };
}

export function buildBoardScopeWhere(
  user: NonNullable<GQLContext["user"]>,
): Record<string, unknown> {
  if (user.role === "ward") {
    return {
      ward_id: user.wardId ?? undefined,
      assigned_level: "ward",
    };
  }

  if (user.role === "municipality") {
    return {
      escalated_to_municipality: true,
    };
  }

  return {};
}

export function assertCanManageReport(
  user: NonNullable<GQLContext["user"]>,
  report: { ward_id: string | null },
) {
  if (
    user.role === "ward" &&
    user.wardId &&
    report.ward_id &&
    report.ward_id !== user.wardId
  ) {
    throw new Error("You can only manage reports in your assigned ward");
  }
}

export async function findWorkflowColumn(
  prisma: GQLContext["prisma"],
  role: WorkflowView,
  mappedStatus: WorkflowStatus,
) {
  return prisma.kanban_columns.findFirst({
    where: {
      mapped_status: mappedStatus,
      OR: [{ role_access: { has: role } }, { role_access: { isEmpty: true } }],
    },
    orderBy: { position: "asc" },
  });
}

export function createWorkflowHistoryEntry(params: {
  type: WorkflowHistoryEntry["type"];
  actor: NonNullable<GQLContext["user"]>;
  fromStatus?: string;
  toStatus?: string;
  fromLevel?: string;
  toLevel?: string;
  note?: string;
  instructions?: string;
}): WorkflowHistoryEntry {
  return {
    type: params.type,
    at: new Date().toISOString(),
    actor_id: params.actor.id,
    actor_role: params.actor.role,
    actor_email: params.actor.email,
    from_status: params.fromStatus,
    to_status: params.toStatus,
    from_level: params.fromLevel,
    to_level: params.toLevel,
    note: params.note,
    instructions: params.instructions,
  };
}

export function createSystemWorkflowHistoryEntry(params: {
  type: WorkflowHistoryEntry["type"];
  fromStatus?: string;
  toStatus?: string;
  fromLevel?: string;
  toLevel?: string;
  note?: string;
  instructions?: string;
  previousDeadlineAt?: Date | string | null;
  deadlineAt?: Date | string | null;
  escalationType?: string;
  escalationSource?: string;
  penaltyPoints?: number;
  penaltyEventType?: string;
}): WorkflowHistoryEntry {
  const actor = buildSystemActor();

  return {
    type: params.type,
    at: new Date().toISOString(),
    actor_id: actor.id,
    actor_role: actor.role,
    actor_email: actor.email,
    from_status: params.fromStatus,
    to_status: params.toStatus,
    from_level: params.fromLevel,
    to_level: params.toLevel,
    note: params.note,
    instructions: params.instructions,
    previous_deadline_at: params.previousDeadlineAt
      ? new Date(params.previousDeadlineAt).toISOString()
      : undefined,
    deadline_at: params.deadlineAt
      ? new Date(params.deadlineAt).toISOString()
      : undefined,
    escalation_type: params.escalationType,
    escalation_source: params.escalationSource,
    penalty_points: params.penaltyPoints,
    penalty_event_type: params.penaltyEventType,
  };
}

export function mergeWorkflowHistory(
  currentHistory: unknown,
  entry: WorkflowHistoryEntry,
) {
  return appendWorkflowHistory(currentHistory, entry);
}

export function reportMatchesWorkflowColumn(
  report: {
    kanban_column_id?: string | null;
    status: string;
    assigned_level?: string | null;
    escalated_to_municipality?: boolean | null;
    returned_to_ward_at?: Date | string | null;
  },
  column: { id: string; mapped_status: string },
  view: WorkflowView,
  availableColumns: Array<{ id: string; mapped_status: string }>,
) {
  const boardStatus = getWorkflowBoardStatus(report, view);
  const savedColumn = report.kanban_column_id
    ? availableColumns.find(
        (availableColumn) => availableColumn.id === report.kanban_column_id,
      ) ?? null
    : null;

  if (savedColumn?.mapped_status === boardStatus) {
    return savedColumn.id === column.id;
  }

  return boardStatus === column.mapped_status;
}

export function resolveWorkflowColumnId(
  report: {
    kanban_column_id?: string | null;
    status: string;
    assigned_level?: string | null;
    escalated_to_municipality?: boolean | null;
    returned_to_ward_at?: Date | string | null;
  },
  columns: Array<{ id: string; mapped_status: string }>,
  view: WorkflowView,
) {
  const boardStatus = getWorkflowBoardStatus(report, view);
  const savedColumn = report.kanban_column_id
    ? columns.find((column) => column.id === report.kanban_column_id) ?? null
    : null;

  if (savedColumn?.mapped_status === boardStatus) {
    return savedColumn.id;
  }

  return (
    columns.find((column) => column.mapped_status === boardStatus)?.id ??
    savedColumn?.id ??
    report.kanban_column_id ??
    null
  );
}
