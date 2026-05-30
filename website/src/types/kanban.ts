export interface AssignedDepartment {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssignedOfficer {
  id: string;
  name: string;
  email: string | null;
  phone_number: string | null;
  type: "ward_officer" | "municipality_officer";
  department: AssignedDepartment;
}

export interface WardInfo {
  id: string;
  name: string;
  ward_code: string;
}

export interface ReportPostSummary {
  id: string;
  rating_average: number;
  rating_count: number;
  comment_count: number;
  bookmark_count: number;
  edited_count: number;
  completed_at: string;
  updated_at: string;
}

export interface ReportTaskComment {
  id: string;
  content: string;
  created_at: string;
  commenter_name: string;
  commenter_id: string | null;
  is_anonymous: boolean;
}

export interface ReportCard {
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
  photo_urls: string[] | null;
  address_text: string | null;
  location_lat: number | null;
  location_lng: number | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
  incoming_seen_at: string | null;
  incoming_ack_deadline_at: string | null;
  ward_active_started_at: string | null;
  ward_deadline_at: string | null;
  ward_deadline_reason: string | null;
  municipality_received_at: string | null;
  municipality_seen_at: string | null;
  municipality_deadline_at: string | null;
  estimated_completion_date: string | null;
  kanban_column_id: string | null;
  ward_id: string | null;
  assigned_level: "ward" | "municipality";
  escalated_to_municipality: boolean;
  escalated_at: string | null;
  escalation_type: string | null;
  escalation_source: string | null;
  returned_to_ward_at: string | null;
  pathway_reason: string | null;
  return_reasoning: string | null;
  return_instructions: string | null;
  status_history: unknown[] | null;
  resolution_description: string | null;
  resolution_photo_urls: string[] | null;
  assigned_department: AssignedDepartment | null;
  assigned_officer: AssignedOfficer | null;
  ward: WardInfo | null;
  report_post: ReportPostSummary | null;
}

export interface GetReportTaskCommentsData {
  reportComments: ReportTaskComment[];
}

export interface KanbanColumn {
  id: string;
  name: string;
  position: number;
  color: string;
  deadline_days: number | null;
  is_terminal: boolean;
  is_default: boolean;
  role_access: string[];
  mapped_status: string;
  created_at: string;
  updated_at: string;
  report_count: number;
  reports: ReportCard[];
}

export interface KanbanBoardData {
  kanbanBoard: KanbanColumn[];
}

export interface KanbanUserPreferences {
  id: string;
  user_id: string;
  collapsed_columns: string[];
  column_order: string[] | null;
  created_at: string;
  updated_at: string;
}
