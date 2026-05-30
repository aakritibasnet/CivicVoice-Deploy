export interface AnalyticsSummary {
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
}

export interface AnalyticsTimelinePoint {
  date: string;
  created_count: number;
  completed_count: number;
  in_progress_count: number;
}

export interface AnalyticsStatusBreakdown {
  status: "incoming" | "in_progress" | "completed" | "invalid" | "returned";
  count: number;
  percentage: number;
}

export interface AnalyticsCategoryBreakdown {
  category: string;
  count: number;
  percentage: number;
}

export interface AnalyticsTopTask {
  id: string;
  title: string;
  category: string;
  status: "incoming" | "in_progress" | "completed" | "invalid" | "returned";
  upvote_count: number;
  comment_count: number;
  created_at: string;
}

export interface PublishedAnalyticsReport {
  id: string;
  title: string;
  narrative: string;
  auto_published: boolean;
  period_days: number;
  period_start: string;
  period_end: string;
  snapshot_date: string;
  created_at: string;
  summary: AnalyticsSummary;
  timeline: AnalyticsTimelinePoint[];
  status_breakdown: AnalyticsStatusBreakdown[];
  category_breakdown: AnalyticsCategoryBreakdown[];
  top_upvoted_tasks: AnalyticsTopTask[];
}

export interface DashboardAnalytics {
  summary: AnalyticsSummary;
  timeline: AnalyticsTimelinePoint[];
  status_breakdown: AnalyticsStatusBreakdown[];
  category_breakdown: AnalyticsCategoryBreakdown[];
  top_upvoted_tasks: AnalyticsTopTask[];
  published_reports: PublishedAnalyticsReport[];
  period_days: number;
  generated_at: string;
}

export interface DashboardAnalyticsData {
  dashboardAnalytics: DashboardAnalytics;
}

export interface PublishAnalyticsReportData {
  publishAnalyticsReport: PublishedAnalyticsReport;
}
