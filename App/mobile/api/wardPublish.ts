// api/wardPublish.ts
import { api } from "@/lib/api";

export type PublishStatus = {
  last_published_at: string | null;
  next_auto_publish_at: string;
  days_remaining: number;
  cycle_days: number;
};

export type TaskSnapshot = {
  report_id: number;
  title: string;
  category: string | null;
  status: string;
  assigned_to: string | null;
  officer_name: string | null;
  department_name: string | null;
  created_at: string;
  updated_at: string;
};

export type StatusChange = {
  report_id: number;
  title: string;
  old_status: string;
  new_status: string;
};

export type PublishPreview = {
  can_publish: boolean;
  reason?: string;
  days_remaining: number;
  next_auto_publish: string | null;
  current_snapshot: TaskSnapshot[];
  changes_since_last: {
    new_tasks: number;
    status_changes: StatusChange[];
    total_changes: number;
  };
  summary: string;
};

export type PublishedReport = {
  id: string;
  published_at: string;
  cycle_start: string;
  cycle_end: string;
  is_auto_published: boolean;
  summary_text: string;
  published_by_name: string | null;
};

export type PublicReport = {
  id: string;
  ward_name: string;
  published_at: string;
  period: { from: string; to: string };
  overview: {
    total_tasks: number;
    planned: number;
    in_progress: number;
    completed: number;
    closed: number;
  };
  sections: {
    planned_work: { title: string; category: string | null; department: string | null }[];
    in_progress: { title: string; category: string | null; officer: string | null; department: string | null }[];
    completed_work: { title: string; category: string | null; officer: string | null; department: string | null }[];
  };
  changes_since_last_report: {
    new_tasks: number;
    status_updates: { title: string; from: string; to: string }[];
  };
  summary_text: string;
};

export async function getPublishStatus(): Promise<PublishStatus> {
  const res = await api.get("/wards/publish/status");
  return res.data;
}

export async function getPublishPreview(): Promise<PublishPreview> {
  const res = await api.get("/wards/publish/preview");
  return res.data;
}

export async function publishReport(): Promise<{ id: string; published_at: string; summary: string }> {
  const res = await api.post("/wards/publish");
  return res.data;
}

export async function getPublishedReports(page = 1): Promise<{
  reports: PublishedReport[];
  pagination: { page: number; total: number; totalPages: number };
}> {
  const res = await api.get("/wards/published", { params: { page } });
  return res.data;
}

export async function getPublicPublishedReport(reportId: string): Promise<PublicReport> {
  const res = await api.get(`/wards/published/${reportId}`);
  return res.data?.report;
}

export type PublishedFeedReport = {
  id: string;
  ward_name: string;
  published_at: string;
  period_start: string;
  period_end: string;
  is_auto_published: boolean;
  published_by_name: string | null;
  summary_text: string;
  overview: {
    total_tasks: number;
    planned: number;
    in_progress: number;
    completed: number;
    closed: number;
  };
};

export async function getPublishedReportsFeed(page = 1, limit = 10): Promise<{
  reports: PublishedFeedReport[];
  pagination: { page: number; total: number; totalPages: number };
}> {
  const res = await api.get("/wards/published-feed", { params: { page, limit } });
  return { reports: res.data.reports, pagination: res.data.pagination };
}
