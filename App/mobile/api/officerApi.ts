// api/officerApi.ts
import { api } from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/feedback";
import { getAccessToken } from "@/lib/session";

// ─── Types ─────────────────────────────────────────────────────────────

export type OfficerTask = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  location_text?: string;
  location_lat?: number;
  location_lng?: number;
  ward_id?: number;
  ward_name?: string;
  municipality_id?: number;
  municipality_name?: string;
  department_id?: string;
  department_name?: string;
  assigned_officer_id: string;
  officer_name?: string;
  status: "todo" | "in_progress" | "completed" | "invalid";
  priority: "low" | "medium" | "high" | "critical";
  linked_report_id?: number;
  report_title?: string;
  report_media_url?: string;
  report_photo_urls?: string[];
  escalated_from?: number;
  escalated_to?: number;
  assigned_at: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  proof_count: number;
};

export type TaskProof = {
  id: string;
  task_id: string;
  officer_id: string;
  type: "progress" | "completion" | "invalidation";
  image_url: string;
  note?: string;
  created_at: string;
};

export type TaskActivity = {
  id: string;
  task_id: string;
  actor_id: string;
  actor_name?: string;
  actor_role: string;
  action: string;
  from_status?: string;
  to_status?: string;
  note?: string;
  created_at: string;
};

export type TaskComment = {
  id: string;
  task_id: string;
  author_id: string;
  author_name?: string;
  author_role: string;
  public_tag?: string;
  content: string;
  created_at: string;
};

export type OfficerNotification = {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  body?: string;
  related_task_id?: string;
  related_report_id?: string;
  task_title?: string;
  report_title?: string;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
};

export type OfficerProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
  type?: "ward_officer" | "municipality_officer";
  profile_image_url?: string | null;
  created_at: string;
  ward_id?: number;
  ward_name?: string;
  department_id?: string;
  department_name?: string;
  municipality_id?: number;
  municipality_name?: string | null;
  must_change_password: boolean;
  total_tasks: number;
  completed_tasks: number;
  active_tasks: number;
  incoming_tasks?: number;
  invalid_tasks?: number;
  scope_source?: string;
};

export type TaskFilters = {
  status?: string;
  priority?: string;
  ward_id?: number;
  department_id?: string;
  escalated_only?: boolean;
  assigned_only?: boolean;
};

// ─── Helpers ───────────────────────────────────────────────────────────

function extract(err: any, fallback: string) {
  return getFriendlyErrorMessage(err, fallback);
}

// ─── Tasks ─────────────────────────────────────────────────────────────

export async function getOfficerTasks(filters?: TaskFilters): Promise<OfficerTask[]> {
  try {
    const params: Record<string, string> = {};
    if (filters?.status) params.status = filters.status;
    if (filters?.priority) params.priority = filters.priority;
    if (filters?.ward_id) params.ward_id = String(filters.ward_id);
    if (filters?.department_id) params.department_id = filters.department_id;
    if (filters?.escalated_only) params.escalated_only = "true";
    if (filters?.assigned_only === false) params.assigned_only = "false";

    const res = await api.get("/officer/tasks", { params });
    return res.data?.data?.tasks ?? [];
  } catch (err: any) {
    throw new Error(extract(err, "Failed to load tasks"));
  }
}

export async function getOfficerTaskDetail(taskId: string): Promise<{
  task: OfficerTask;
  activity: TaskActivity[];
  comments: TaskComment[];
  proof: TaskProof[];
}> {
  try {
    const res = await api.get(`/officer/tasks/${taskId}`);
    return res.data?.data;
  } catch (err: any) {
    throw new Error(extract(err, "Failed to load task detail"));
  }
}

export async function updateTaskStatus(
  taskId: string,
  status: string,
  note?: string,
): Promise<{ from: string; to: string }> {
  try {
    const res = await api.patch(`/officer/tasks/${taskId}/status`, { status, note });
    return res.data?.data;
  } catch (err: any) {
    throw new Error(extract(err, "Failed to update status"));
  }
}

export async function uploadTaskProof(
  taskId: string,
  imageUri: string,
  type: string = "completion",
  note?: string,
): Promise<TaskProof> {
  try {
    const formData = new FormData();
    const filename = imageUri.split("/").pop() || "proof.jpg";
    formData.append("image", {
      uri: imageUri,
      name: filename,
      type: "image/jpeg",
    } as any);
    formData.append("type", type);
    if (note) formData.append("note", note);

    const token = await getAccessToken();
    const res = await api.post(`/officer/tasks/${taskId}/proof`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout: 60000,
    });
    return res.data?.data?.proof;
  } catch (err: any) {
    throw new Error(extract(err, "Failed to upload proof"));
  }
}

export async function addTaskComment(
  taskId: string,
  content: string,
): Promise<TaskComment> {
  try {
    const res = await api.post(`/officer/tasks/${taskId}/comments`, { content });
    return res.data?.data?.comment;
  } catch (err: any) {
    throw new Error(extract(err, "Failed to add comment"));
  }
}

// ─── Reports ───────────────────────────────────────────────────────────

export type OfficerReport = {
  id: string;
  title: string;
  description?: string;
  category: string;
  status: string;
  media_url?: string;
  photo_urls?: string[];
  address_text?: string;
  location_lat?: number;
  location_lng?: number;
  submitted_at: string;
  created_at: string;
  upvote_count: number;
  comment_count: number;
  ward_name?: string;
  municipality_name?: string;
  task_id?: string;
  task_status?: string;
};

export type ReportComment = {
  id: string;
  user_id?: string | null;
  officer_id?: string | null;
  author_name?: string;
  author_role?: string;
  author_avatar?: string;
  author_ward_id?: string;
  author_ward_name?: string;
  public_tag?: string;
  content: string;
  created_at: string;
};

export async function getOfficerReports(): Promise<OfficerReport[]> {
  try {
    const res = await api.get("/officer/reports");
    return res.data?.data?.reports ?? [];
  } catch (err: any) {
    throw new Error(extract(err, "Failed to load reports"));
  }
}

export async function getOfficerReportDetail(reportId: string): Promise<{
  report: OfficerReport & { reporter_name?: string; is_public?: boolean };
  comments: ReportComment[];
}> {
  try {
    const res = await api.get(`/officer/reports/${reportId}`);
    return res.data?.data;
  } catch (err: any) {
    throw new Error(extract(err, "Failed to load report"));
  }
}

export async function addReportComment(
  reportId: string,
  content: string,
): Promise<ReportComment> {
  try {
    const res = await api.post(`/officer/reports/${reportId}/comments`, { content });
    return res.data?.data?.comment;
  } catch (err: any) {
    throw new Error(extract(err, "Failed to add comment"));
  }
}

// ─── Notifications ─────────────────────────────────────────────────────

export async function getOfficerNotifications(
  unreadOnly?: boolean,
): Promise<OfficerNotification[]> {
  try {
    const params: Record<string, string> = {};
    if (unreadOnly) params.unread_only = "true";
    const res = await api.get("/officer/notifications", { params });
    return res.data?.data?.notifications ?? [];
  } catch (err: any) {
    throw new Error(extract(err, "Failed to load notifications"));
  }
}

export async function getOfficerUnreadCount(): Promise<number> {
  try {
    const res = await api.get("/officer/notifications/unread-count");
    return res.data?.data?.count ?? 0;
  } catch {
    return 0;
  }
}

export async function markOfficerNotificationRead(id: string): Promise<void> {
  try {
    await api.patch(`/officer/notifications/${id}/read`, {});
  } catch (err: any) {
    throw new Error(extract(err, "Failed to mark as read"));
  }
}

export async function markAllOfficerNotificationsRead(): Promise<void> {
  try {
    await api.patch("/officer/notifications/mark-all-read", {});
  } catch (err: any) {
    throw new Error(extract(err, "Failed to mark all as read"));
  }
}

// ─── History ───────────────────────────────────────────────────────────

export type HistoryItem = {
  id: string;
  title: string;
  category?: string;
  location_text?: string;
  status: string;
  priority: string;
  assigned_at: string;
  started_at?: string;
  completed_at?: string;
  ward_name?: string;
  department_name?: string;
  proof_count: number;
};

export async function getOfficerHistory(type?: string): Promise<HistoryItem[]> {
  try {
    const params: Record<string, string> = {};
    if (type) params.type = type;
    const res = await api.get("/officer/history", { params });
    return res.data?.data?.history ?? [];
  } catch (err: any) {
    throw new Error(extract(err, "Failed to load history"));
  }
}

// ─── Profile ───────────────────────────────────────────────────────────

export async function getOfficerProfileApi(): Promise<OfficerProfile> {
  try {
    const res = await api.get("/officer/profile");
    return res.data?.data?.profile;
  } catch (err: any) {
    throw new Error(extract(err, "Failed to load profile"));
  }
}

export async function updateOfficerPhoto(imageUri: string): Promise<string> {
  try {
    const formData = new FormData();
    const filename = imageUri.split("/").pop() || "photo.jpg";
    formData.append("image", {
      uri: imageUri,
      name: filename,
      type: "image/jpeg",
    } as any);

    const token = await getAccessToken();
    const res = await api.patch("/officer/profile/photo", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout: 30000,
    });
    return res.data?.data?.profile_image_url;
  } catch (err: any) {
    throw new Error(extract(err, "Failed to update photo"));
  }
}

export async function changeOfficerPassword(
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  try {
    await api.post("/officer/change-password", {
      old_password: oldPassword,
      new_password: newPassword,
    });
  } catch (err: any) {
    throw new Error(extract(err, "Failed to change password"));
  }
}
