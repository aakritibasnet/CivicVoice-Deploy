import { gql } from "@apollo/client";

export const REPORT_CARD_FRAGMENT = gql`
  fragment ReportCardFields on ReportCard {
    id
    title
    description
    category
    subcategory
    status
    priority
    upvote_count
    comment_count
    is_public
    media_url
    photo_urls
    address_text
    location_lat
    location_lng
    submitted_at
    created_at
    updated_at
    incoming_seen_at
    incoming_ack_deadline_at
    ward_active_started_at
    ward_deadline_at
    ward_deadline_reason
    municipality_received_at
    municipality_seen_at
    municipality_deadline_at
    estimated_completion_date
    kanban_column_id
    ward_id
    assigned_level
    escalated_to_municipality
    escalated_at
    escalation_type
    escalation_source
    returned_to_ward_at
    pathway_reason
    return_reasoning
    return_instructions
    status_history
    resolution_description
    resolution_photo_urls
    report_post {
      id
      rating_average
      rating_count
      comment_count
      bookmark_count
      edited_count
      completed_at
      updated_at
    }
    assigned_department {
      id
      slug
      name
      description
      created_at
      updated_at
    }
    assigned_officer {
      id
      name
      email
      phone_number
      type
      department {
        id
        slug
        name
        description
        created_at
        updated_at
      }
    }
    ward {
      id
      name
      ward_code
    }
  }
`;

export const KANBAN_COLUMN_FRAGMENT = gql`
  fragment KanbanColumnFields on KanbanColumn {
    id
    name
    position
    color
    deadline_days
    is_terminal
    is_default
    role_access
    mapped_status
    created_at
    updated_at
    report_count
  }
`;

export const KANBAN_PREFERENCES_FRAGMENT = gql`
  fragment KanbanPreferencesFields on KanbanUserPreferences {
    id
    user_id
    collapsed_columns
    column_order
    created_at
    updated_at
  }
`;

export const GET_KANBAN_BOARD = gql`
  ${REPORT_CARD_FRAGMENT}
  ${KANBAN_COLUMN_FRAGMENT}
  query GetKanbanBoard {
    kanbanBoard {
      ...KanbanColumnFields
      reports {
        ...ReportCardFields
      }
    }
  }
`;

export const GET_KANBAN_COLUMN = gql`
  ${REPORT_CARD_FRAGMENT}
  ${KANBAN_COLUMN_FRAGMENT}
  query GetKanbanColumn($id: ID!) {
    kanbanColumn(id: $id) {
      ...KanbanColumnFields
      reports {
        ...ReportCardFields
      }
    }
  }
`;

export const MOVE_REPORT = gql`
  ${REPORT_CARD_FRAGMENT}
  mutation MoveReport($reportId: ID!, $columnId: ID!) {
    moveReport(reportId: $reportId, columnId: $columnId) {
      ...ReportCardFields
    }
  }
`;

export const CREATE_KANBAN_COLUMN = gql`
  ${KANBAN_COLUMN_FRAGMENT}
  mutation CreateKanbanColumn($input: CreateColumnInput!) {
    createKanbanColumn(input: $input) {
      ...KanbanColumnFields
    }
  }
`;

export const UPDATE_KANBAN_COLUMN = gql`
  ${KANBAN_COLUMN_FRAGMENT}
  mutation UpdateKanbanColumn($id: ID!, $input: UpdateColumnInput!) {
    updateKanbanColumn(id: $id, input: $input) {
      ...KanbanColumnFields
    }
  }
`;

export const DELETE_KANBAN_COLUMN = gql`
  mutation DeleteKanbanColumn($id: ID!) {
    deleteKanbanColumn(id: $id)
  }
`;

export const REORDER_KANBAN_COLUMNS = gql`
  ${KANBAN_COLUMN_FRAGMENT}
  mutation ReorderKanbanColumns($columnIds: [ID!]!) {
    reorderKanbanColumns(columnIds: $columnIds) {
      ...KanbanColumnFields
    }
  }
`;

export const GET_KANBAN_PREFERENCES = gql`
  ${KANBAN_PREFERENCES_FRAGMENT}
  query GetKanbanPreferences {
    kanbanUserPreferences {
      ...KanbanPreferencesFields
    }
  }
`;

export const GET_REPORT_TASK_COMMENTS = gql`
  query GetReportTaskComments($reportId: ID!, $limit: Int) {
    reportComments(reportId: $reportId, limit: $limit) {
      id
      content
      created_at
      commenter_name
      commenter_id
      is_anonymous
    }
  }
`;

export const UPDATE_KANBAN_PREFERENCES = gql`
  ${KANBAN_PREFERENCES_FRAGMENT}
  mutation UpdateKanbanPreferences($input: UpdatePreferencesInput!) {
    updateKanbanPreferences(input: $input) {
      ...KanbanPreferencesFields
    }
  }
`;

export const TOGGLE_COLUMN_COLLAPSE = gql`
  ${KANBAN_PREFERENCES_FRAGMENT}
  mutation ToggleColumnCollapse($columnId: ID!) {
    toggleColumnCollapse(columnId: $columnId) {
      ...KanbanPreferencesFields
    }
  }
`;

// ─── Add this to your existing kanban.ts operations file ───

/**
 * Move a report to a terminal column with resolution data.
 * Used when the target column requires an explanation (completed, invalid, transferred).
 */
export const MOVE_REPORT_WITH_RESOLUTION = gql`
  ${REPORT_CARD_FRAGMENT}
  mutation MoveReportWithResolution(
    $reportId: ID!
    $columnId: ID!
    $resolution: ResolutionInput!
  ) {
    moveReportWithResolution(
      reportId: $reportId
      columnId: $columnId
      resolution: $resolution
    ) {
      ...ReportCardFields
    }
  }
`;

export const APPLY_REPORT_WORKFLOW_ACTION = gql`
  ${REPORT_CARD_FRAGMENT}
  mutation ApplyReportWorkflowAction(
    $reportId: ID!
    $action: ReportWorkflowAction!
    $input: ReportWorkflowActionInput
  ) {
    applyReportWorkflowAction(
      reportId: $reportId
      action: $action
      input: $input
    ) {
      ...ReportCardFields
    }
  }
`;

export const MARK_REPORT_SEEN = gql`
  ${REPORT_CARD_FRAGMENT}
  mutation MarkReportSeen($reportId: ID!) {
    markReportSeen(reportId: $reportId) {
      ...ReportCardFields
    }
  }
`;

export const UPDATE_REPORT_DEADLINE = gql`
  ${REPORT_CARD_FRAGMENT}
  mutation UpdateReportDeadline($reportId: ID!, $input: UpdateReportDeadlineInput!) {
    updateReportDeadline(reportId: $reportId, input: $input) {
      ...ReportCardFields
    }
  }
`;

export const ASSIGN_REPORT = gql`
  ${REPORT_CARD_FRAGMENT}
  mutation AssignReport($reportId: ID!, $input: AssignReportInput!) {
    assignReport(reportId: $reportId, input: $input) {
      ...ReportCardFields
    }
  }
`;

export const UNASSIGN_REPORT = gql`
  ${REPORT_CARD_FRAGMENT}
  mutation UnassignReport($reportId: ID!) {
    unassignReport(reportId: $reportId) {
      ...ReportCardFields
    }
  }
`;

// ──────────────────────────────────────────────────────
// NOTE: Your existing operations (GET_KANBAN_BOARD, MOVE_REPORT, etc.)
// remain unchanged. Just add MOVE_REPORT_WITH_RESOLUTION to the exports.
// ──────────────────────────────────────────────────────
