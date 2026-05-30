export type ReportFeedSort = "latest" | "top_rated";
export type TaskReportFeedSort = "recent" | "most_upvoted";
export type ReportActorRole = "ward_officer" | "dashboard_manager" | "admin" | "officer" | "municipality" | "ward";
export type ReportViewerRole = "ward" | "municipality" | "admin" | "citizen" | "officer";

export interface ReportWardInfo {
  id: string;
  name: string;
  ward_code: string;
}

export interface ReportTask {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "incoming" | "in_progress" | "completed" | "returned" | "invalid";
  submitted_at: string;
  before_image_url: string | null;
  ward: ReportWardInfo | null;
}

export interface TaskCompletion {
  id: string;
  task_id: string;
  description: string | null;
  before_image_url: string | null;
  after_image_url: string;
  completed_at: string;
  completed_by_name: string;
  completed_by_role: string;
}

export interface ReportPost {
  id: string;
  task_id: string;
  completion_id: string;
  ward_name: string;
  completed_by_name: string;
  completed_by_role: string;
  title: string;
  description: string | null;
  category: string;
  priority: "low" | "medium" | "high" | "critical";
  before_image_url: string | null;
  after_image_url: string;
  rating_average: number;
  rating_count: number;
  comment_count: number;
  bookmark_count: number;
  edited_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string;
  is_reopened: boolean;
  reopened_at: string | null;
  reopened_reason: string | null;
  reopened_by_name: string | null;
  reopened_status:
    | "incoming"
    | "in_progress"
    | "completed"
    | "returned"
    | "invalid"
    | null;
  viewer_rating: number | null;
  is_bookmarked: boolean;
  viewer_can_rate: boolean;
  viewer_can_comment: boolean;
  viewer_can_bookmark: boolean;
  viewer_can_edit: boolean;
  ward: ReportWardInfo | null;
  task: ReportTask;
  completion: TaskCompletion;
}

export interface Rating {
  id: string;
  post_id: string;
  user_id: string;
  rating: number;
  created_at: string;
  updated_at: string;
}

export interface ReportComment {
  id: string;
  post_id: string;
  parent_id: string | null;
  content: string;
  anonymous_name: string;
  display_name: string;
  author_role: string;
  is_official: boolean;
  reply_count: number;
  created_at: string;
  updated_at: string;
  viewer_can_report: boolean;
  viewer_can_reply: boolean;
  replies: ReportComment[];
}

export interface CommentReport {
  id: string;
  comment_id: string;
  user_id: string;
  reason: string;
  created_at: string;
}

export interface BookmarkToggleResult {
  post_id: string;
  is_bookmarked: boolean;
  bookmark_count: number;
}

export interface ReportFeedPageInfo {
  endCursor: string | null;
  hasMore: boolean;
}

export interface ReportFeedConnection {
  nodes: ReportPost[];
  pageInfo: ReportFeedPageInfo;
}

export interface ReportFeedScope {
  wards: ReportWardInfo[];
  categories: string[];
  defaultWardId: string | null;
  wardScopeLabel: string;
}

export interface PublicTaskReport {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "incoming" | "in_progress" | "completed" | "returned" | "invalid";
  upvote_count: number;
  comment_count: number;
  media_url: string | null;
  photo_urls: string[] | null;
  address_text: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
  ward_id: string | null;
  assigned_level: "ward" | "municipality";
  escalated_to_municipality: boolean;
  escalated_at: string | null;
  escalation_type: string | null;
  returned_to_ward_at: string | null;
  pathway_reason: string | null;
  return_reasoning: string | null;
  return_instructions: string | null;
  ward: ReportWardInfo | null;
}

export interface TaskReportFeedConnection {
  nodes: PublicTaskReport[];
  pageInfo: ReportFeedPageInfo;
}

export interface GetReportFeedData {
  getReportFeed: ReportFeedConnection;
}

export interface GetReportFeedWardsData {
  wards: ReportWardInfo[];
}

export interface GetReportFeedScopeData {
  reportFeedScope: ReportFeedScope;
}

export interface GetTaskReportFeedData {
  getTaskReportFeed: TaskReportFeedConnection;
}

export interface GetReportPostData {
  getReportPost: ReportPost | null;
}

export interface GetPublicTaskReportData {
  getPublicTaskReport: PublicTaskReport | null;
}

export interface GetCommentsData {
  getComments: ReportComment[];
}

export interface CompleteTaskData {
  completeTask: ReportPost;
}

export interface CreateRatingData {
  createRating: Rating;
}

export interface UpdateRatingData {
  updateRating: Rating;
}

export interface AddCommentData {
  addComment: ReportComment;
}

export interface ReportCommentData {
  reportComment: CommentReport;
}

export interface ToggleBookmarkData {
  toggleBookmark: BookmarkToggleResult;
}

export interface EditReportPostData {
  editReportPost: ReportPost;
}
