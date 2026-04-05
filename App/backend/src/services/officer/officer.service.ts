// src/services/officer/officer.service.ts
//
// All queries target the Prisma-managed tables:
//   reports, task_completions, activity_log, comments, notifications, officers, wards, officer_departments
//
// "Tasks" in the officer mobile UI = reports assigned to the officer
//   (via assigned_field_officer_id).
//
// Status enum (report_status): incoming, in_progress, completed, returned, invalid
// Priority enum (priority_level): low, medium, high, critical

import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";
import bcrypt from "bcrypt";
import {
  notifyNewComment,
  notifyStatusChange,
} from "@/services/notifications/triggers.service";

// ─── Types ─────────────────────────────────────────────────────────────
type TaskFilters = {
  status?: string;
  priority?: string;
  ward_id?: number;
  department_id?: string;
  escalated_only?: boolean;
  assigned_only?: boolean;
};

type OfficerAccessScope = {
  actorKind: "officer" | "user";
  officerType: string | null;
  wardId: string | null;
  wardName: string | null;
  municipalityId: string | null;
  municipalityName: string | null;
  scopeSource: "ward" | "user" | "heuristic" | "none";
};

// Map mobile status names to DB enum values
// Mobile "todo" → DB "incoming"
function toDbStatus(mobileStatus: string): string {
  if (mobileStatus === "todo") return "incoming";
  return mobileStatus; // in_progress, completed, invalid are the same
}

function toMobileStatus(dbStatus: string): string {
  if (dbStatus === "incoming") return "todo";
  if (dbStatus === "returned") return "todo"; // treat returned as todo
  return dbStatus;
}

async function logOfficerActivity(
  reportId: string,
  officerId: string,
  action: string,
  details: Record<string, unknown> = {},
) {
  await pool.query(
    `INSERT INTO activity_log (report_id, actor_id, actor_name, action, details)
     VALUES (
       $1,
       NULL,
       (SELECT first_name || ' ' || last_name FROM officers WHERE id = $2),
       $3,
       $4::jsonb
     )`,
    [
      reportId,
      officerId,
      action,
      JSON.stringify({
        ...details,
        actor_type: "officer",
        officer_id: officerId,
      }),
    ],
  );
}

async function findWorkflowKanbanColumnId(
  mappedStatus: string,
  assignedLevel: string | null | undefined,
) {
  if (
    mappedStatus !== "incoming" &&
    mappedStatus !== "in_progress" &&
    mappedStatus !== "completed" &&
    mappedStatus !== "returned" &&
    mappedStatus !== "invalid"
  ) {
    return null;
  }

  const workflowRole = assignedLevel === "municipality" ? "municipality" : "ward";
  const res = await pool.query<{ id: string }>(
    `SELECT id
     FROM kanban_columns
     WHERE mapped_status = $1::report_status
       AND (
         role_access @> ARRAY[$2::user_role]
         OR COALESCE(array_length(role_access, 1), 0) = 0
       )
     ORDER BY
       CASE WHEN role_access @> ARRAY[$2::user_role] THEN 0 ELSE 1 END,
       position ASC,
       created_at ASC
     LIMIT 1`,
    [mappedStatus, workflowRole],
  );

  return res.rows[0]?.id ?? null;
}

async function resolveOfficerAccessScope(
  officerId: string,
): Promise<OfficerAccessScope> {
  const officerRes = await pool.query(
    `SELECT o.type,
            o.ward_id,
            w.name AS ward_name,
            w.municipality_id,
            m.name AS municipality_name
     FROM officers o
     LEFT JOIN wards w ON w.id::text = o.ward_id::text
     LEFT JOIN municipalities m ON m.id::text = w.municipality_id::text
     WHERE o.id::text = $1
       AND o.deleted_at IS NULL`,
    [officerId],
  );

  if (officerRes.rows.length > 0) {
    const row = officerRes.rows[0];
    let municipalityId = row.municipality_id ?? null;
    let municipalityName = row.municipality_name ?? null;
    let scopeSource: OfficerAccessScope["scopeSource"] = municipalityId
      ? "ward"
      : "none";

    if (row.type === "municipality_officer" && !municipalityId) {
      const fallbackRes = await pool.query(
        `SELECT w.municipality_id,
                m.name AS municipality_name
         FROM reports r
         JOIN wards w ON w.id::text = r.ward_id::text
         LEFT JOIN municipalities m ON m.id::text = w.municipality_id::text
         WHERE w.municipality_id IS NOT NULL
           AND (
             r.assigned_level = 'municipality'
             OR r.escalated_to_municipality = true
           )
         GROUP BY w.municipality_id, m.name
         ORDER BY COUNT(*) DESC, m.name ASC
         LIMIT 1`,
      );

      municipalityId = fallbackRes.rows[0]?.municipality_id ?? null;
      municipalityName = fallbackRes.rows[0]?.municipality_name ?? null;
      scopeSource = municipalityId ? "heuristic" : "none";
    }

    return {
      actorKind: "officer",
      officerType: row.type ?? null,
      wardId: row.ward_id ?? null,
      wardName: row.ward_name ?? null,
      municipalityId,
      municipalityName,
      scopeSource,
    };
  }

  const userRes = await pool.query(
    `SELECT u.ward_id,
            u.municipality_id,
            w.name AS ward_name,
            w.municipality_id AS ward_municipality_id,
            wm.name AS ward_municipality_name,
            m.name AS municipality_name
     FROM users u
     LEFT JOIN wards w ON w.id::text = u.ward_id::text
     LEFT JOIN municipalities wm ON wm.id::text = w.municipality_id::text
     LEFT JOIN municipalities m ON m.id::text = u.municipality_id::text
     WHERE u.id::text = $1
       AND u.role = 'officer'`,
    [officerId],
  );

  if (userRes.rows.length > 0) {
    const row = userRes.rows[0];
    const municipalityId = row.municipality_id ?? row.ward_municipality_id ?? null;
    return {
      actorKind: "user",
      officerType: "officer",
      wardId: row.ward_id ?? null,
      wardName: row.ward_name ?? null,
      municipalityId: municipalityId ?? null,
      municipalityName:
        row.municipality_name ??
        (municipalityId ? row.municipality_name : row.ward_municipality_name) ??
        null,
      scopeSource: municipalityId
        ? "user"
        : row.ward_id
          ? "ward"
          : "none",
    };
  }

  return {
    actorKind: "officer",
    officerType: null,
    wardId: null,
    wardName: null,
    municipalityId: null,
    municipalityName: null,
    scopeSource: "none",
  };
}

// ─── Tasks (= Reports assigned to officer) ────────────────────────────

export async function getOfficerTasks(officerId: string, filters: TaskFilters) {
  const scope = await resolveOfficerAccessScope(officerId);
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  // By default, show tasks assigned to this officer
  if (filters.assigned_only !== false) {
    conditions.push(`r.assigned_field_officer_id = $${idx++}`);
    params.push(officerId);
  } else if (
    scope.officerType === "municipality_officer" &&
    scope.municipalityId
  ) {
    conditions.push(`w.municipality_id::text = $${idx++}`);
    params.push(scope.municipalityId);
  } else if (scope.wardId) {
    conditions.push(`r.ward_id::text = $${idx++}`);
    params.push(scope.wardId);
  } else {
    conditions.push(`r.assigned_field_officer_id = $${idx++}`);
    params.push(officerId);
  }

  if (filters.status) {
    const dbStatus = toDbStatus(filters.status);
    if (dbStatus === "incoming") {
      // "todo" = incoming + returned
      conditions.push(`r.status IN ('incoming', 'returned')`);
    } else {
      conditions.push(`r.status = $${idx++}`);
      params.push(dbStatus);
    }
  }

  if (filters.priority) {
    conditions.push(`r.priority = $${idx++}::priority_level`);
    params.push(filters.priority);
  }

  if (filters.ward_id) {
    conditions.push(`r.ward_id::text = $${idx++}`);
    params.push(String(filters.ward_id));
  }

  if (filters.department_id) {
    conditions.push(`r.assigned_department_id = $${idx++}`);
    params.push(filters.department_id);
  }

  if (filters.escalated_only) {
    conditions.push(
      `(r.assigned_level = 'municipality' OR r.escalated_to_municipality = true)`,
    );
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const res = await pool.query(
    `SELECT r.id, r.title, r.description, r.category, r.subcategory,
            r.address_text AS location_text,
            r.location_lat, r.location_lng,
            r.ward_id, r.assigned_department_id AS department_id,
            r.assigned_field_officer_id AS assigned_officer_id,
            r.status, r.priority,
            r.submitted_at AS assigned_at,
            r.actual_completion_date AS completed_at,
            r.escalated_to_municipality,
            r.escalated_at,
            r.photo_urls,
            r.media_url,
            r.created_at, r.updated_at,
            w.name AS ward_name,
            w.municipality_id,
            m.name AS municipality_name,
            od.name AS department_name,
            COALESCE(ofcr.first_name || ' ' || ofcr.last_name) AS officer_name,
            (SELECT COUNT(*)::int FROM task_completions tc WHERE tc.task_id = r.id) AS proof_count
     FROM reports r
     LEFT JOIN wards w ON w.id::text = r.ward_id::text
     LEFT JOIN municipalities m ON m.id::text = w.municipality_id::text
     LEFT JOIN officer_departments od ON od.id::text = r.assigned_department_id::text
     LEFT JOIN officers ofcr ON ofcr.id::text = r.assigned_field_officer_id::text
     ${where}
     ORDER BY
       CASE r.priority
         WHEN 'critical' THEN 0
         WHEN 'high' THEN 1
         WHEN 'medium' THEN 2
         WHEN 'low' THEN 3
       END,
       r.submitted_at DESC`,
    params,
  );

  // Map DB rows to mobile-friendly format
  const tasks = res.rows.map((row: any) => ({
    ...row,
    status: toMobileStatus(row.status),
    // Provide report fields expected by mobile
    linked_report_id: row.id,
    report_title: row.title,
    report_media_url: row.media_url,
    report_photo_urls: row.photo_urls,
  }));

  return { tasks };
}

export async function getTaskDetail(taskId: string, officerId: string) {
  const taskRes = await pool.query(
    `SELECT r.id, r.title, r.description, r.category, r.subcategory,
            r.address_text AS location_text,
            r.location_lat, r.location_lng,
            r.ward_id, r.assigned_department_id AS department_id,
            r.assigned_field_officer_id AS assigned_officer_id,
            r.status, r.priority,
            r.submitted_at AS assigned_at,
            r.actual_completion_date AS completed_at,
            r.escalated_to_municipality,
            r.escalated_at,
            r.photo_urls,
            r.media_url,
            r.is_public,
            r.citizen_name, r.citizen_contact,
            r.ward_notes, r.municipality_notes,
            r.created_at, r.updated_at,
            w.name AS ward_name,
            od.name AS department_name,
            COALESCE(ofcr.first_name || ' ' || ofcr.last_name) AS officer_name,
            u.name AS reporter_name
     FROM reports r
     LEFT JOIN wards w ON w.id::text = r.ward_id::text
     LEFT JOIN officer_departments od ON od.id::text = r.assigned_department_id::text
     LEFT JOIN officers ofcr ON ofcr.id::text = r.assigned_field_officer_id::text
     LEFT JOIN users u ON u.id::text = r.user_id::text
     WHERE r.id::text = $1`,
    [taskId],
  );

  if (taskRes.rows.length === 0) {
    throw new AppError("Task not found", 404);
  }

  const task = taskRes.rows[0];
  task.status = toMobileStatus(task.status);
  task.linked_report_id = task.id;
  task.report_title = task.title;
  task.report_media_url = task.media_url;
  task.report_photo_urls = task.photo_urls;

  // Activity timeline
  const activityRes = await pool.query(
    `SELECT al.id, al.report_id AS task_id, al.actor_id, al.actor_name,
            al.action, al.details, al.created_at,
            COALESCE(u.name, o.first_name || ' ' || o.last_name, al.actor_name) AS actor_name
     FROM activity_log al
     LEFT JOIN users u ON u.id::text = al.actor_id::text
     LEFT JOIN officers o ON o.id::text = al.actor_id::text
     WHERE al.report_id::text = $1
     ORDER BY al.created_at DESC`,
    [taskId],
  );

  // Map activity to mobile format
  const activity = activityRes.rows.map((a: any) => {
    const details = a.details || {};
    return {
      id: a.id,
      task_id: a.task_id,
      actor_id: a.actor_id,
      actor_name: a.actor_name,
      actor_role: "officer",
      action: a.action,
      from_status: details.from_status ? toMobileStatus(details.from_status) : undefined,
      to_status: details.to_status ? toMobileStatus(details.to_status) : undefined,
      note: details.note || details.description || null,
      created_at: a.created_at,
    };
  });

  // Comments
  const commentsRes = await pool.query(
    `SELECT c.id, c.report_id AS task_id,
            COALESCE(c.user_id::text, c.officer_id::text) AS author_id,
            c.public_tag,
            c.content, c.created_at,
            COALESCE(c.public_tag, u.name, o.first_name || ' ' || o.last_name) AS author_name,
            CASE
              WHEN c.officer_id IS NOT NULL THEN 'officer'
              ELSE COALESCE(u.role, 'officer')
            END AS author_role
     FROM comments c
     LEFT JOIN users u ON u.id::text = c.user_id::text
     LEFT JOIN officers o ON o.id::text = c.officer_id::text
     WHERE c.report_id::text = $1
     ORDER BY c.created_at ASC`,
    [taskId],
  );

  // Proof (task_completions)
  const proofRes = await pool.query(
    `SELECT tc.id, tc.task_id, tc.completed_by_officer_id AS officer_id,
            tc.description AS note,
            tc.before_image_url,
            COALESCE(tc.after_image_url, tc.before_image_url) AS image_url,
            tc.proof_type AS type,
            tc.created_at
     FROM task_completions tc
     WHERE tc.task_id = $1
     ORDER BY tc.created_at DESC`,
    [taskId],
  );

  return {
    task,
    activity,
    comments: commentsRes.rows,
    proof: proofRes.rows,
  };
}

export async function updateTaskStatus(
  taskId: string,
  officerId: string,
  newStatus: string,
  note?: string,
) {
  // Verify the report exists and is assigned to this officer
  const taskRes = await pool.query(
    `SELECT id, status, assigned_field_officer_id, assigned_level
     FROM reports
     WHERE id = $1`,
    [taskId],
  );

  if (taskRes.rows.length === 0) {
    throw new AppError("Task not found", 404);
  }

  const task = taskRes.rows[0];

  // Officers can only update tasks assigned to them
  if (task.assigned_field_officer_id !== officerId) {
    throw new AppError("Task not assigned to you", 403);
  }

  const oldDbStatus = task.status;
  const oldMobileStatus = toMobileStatus(oldDbStatus);
  const newDbStatus = toDbStatus(newStatus);

  // Validate transitions
  const validTransitions: Record<string, string[]> = {
    incoming: ["in_progress", "invalid"],
    returned: ["in_progress", "invalid"],
    in_progress: ["completed", "invalid"],
    completed: [],
    invalid: [],
  };

  if (!validTransitions[oldDbStatus]?.includes(newDbStatus)) {
    throw new AppError(
      `Cannot move task from '${oldMobileStatus}' to '${newStatus}'`,
      400,
    );
  }

  // If completing, check completion proof exists
  if (newDbStatus === "completed") {
    const proofRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM task_completions WHERE task_id = $1 AND proof_type = 'completion'`,
      [taskId],
    );
    if (proofRes.rows[0].count === 0) {
      throw new AppError(
        "Cannot complete task without uploading proof. Please upload at least 1 proof image.",
        400,
      );
    }
  }

  // If invalidating, check invalidation proof exists
  if (newDbStatus === "invalid") {
    const proofRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM task_completions WHERE task_id = $1 AND proof_type = 'invalidation'`,
      [taskId],
    );
    if (proofRes.rows[0].count === 0) {
      throw new AppError(
        "Cannot mark task as invalid without uploading invalidation proof with a description.",
        400,
      );
    }
  }

  // Update report status
  const updateFields: string[] = [`status = $2::report_status`];
  const updateParams: any[] = [taskId, newDbStatus];
  let paramIdx = 3;
  const targetKanbanColumnId = await findWorkflowKanbanColumnId(
    newDbStatus,
    task.assigned_level,
  );

  if (targetKanbanColumnId) {
    updateFields.push(`kanban_column_id = $${paramIdx}::uuid`);
    updateParams.push(targetKanbanColumnId);
    paramIdx++;
  }

  if (newDbStatus === "completed") {
    updateFields.push(`actual_completion_date = NOW()`);
  }

  // Append to status_history JSON
  updateFields.push(`status_history = COALESCE(status_history, '[]'::jsonb) || $${paramIdx}::jsonb`);
  updateParams.push(JSON.stringify([{
    from: oldDbStatus,
    to: newDbStatus,
    changed_by: officerId,
    changed_at: new Date().toISOString(),
    note: note || null,
  }]));
  paramIdx++;

  updateFields.push(`updated_at = NOW()`);

  await pool.query(
    `UPDATE reports SET ${updateFields.join(", ")} WHERE id = $1`,
    updateParams,
  );

  // Log activity
  await logOfficerActivity(taskId, officerId, "status_change", {
    from_status: oldDbStatus,
    to_status: newDbStatus,
    note: note || null,
  });

  try {
    await notifyStatusChange(taskId, newDbStatus);
  } catch (err) {
    console.error("notifyStatusChange error:", err);
  }

  return { success: true, from: oldMobileStatus, to: newStatus };
}

// ─── Proof (= task_completions) ───────────────────────────────────────

export async function uploadTaskProof(
  taskId: string,
  officerId: string,
  imageUrl: string,
  type: string = "completion",
  note?: string,
) {
  // Verify report exists and is assigned to officer
  const taskRes = await pool.query(
    `SELECT id, status, assigned_field_officer_id FROM reports WHERE id = $1`,
    [taskId],
  );

  if (taskRes.rows.length === 0) {
    throw new AppError("Task not found", 404);
  }

  const task = taskRes.rows[0];

  if (task.assigned_field_officer_id !== officerId) {
    throw new AppError("Task not assigned to you", 403);
  }

  // Can only upload proof for non-terminal statuses
  if (task.status === "completed" || task.status === "invalid") {
    throw new AppError("Cannot upload proof for completed or invalid tasks", 400);
  }

  // Proof description is required
  if (!note || !note.trim()) {
    throw new AppError("A description is required when uploading proof", 400);
  }

  // Check if a task_completion already exists for this report
  const existingRes = await pool.query(
    `SELECT id FROM task_completions WHERE task_id = $1`,
    [taskId],
  );

  let proofRow;

  if (existingRes.rows.length > 0) {
    // Update existing completion with the new image
    // If type is 'invalidation', store as before_image (since it's not a completion)
    const updateField = type === "invalidation" ? "before_image_url" : "after_image_url";
    const updateRes = await pool.query(
      `UPDATE task_completions
       SET ${updateField} = $2, description = $3, completed_by_officer_id = $4, proof_type = $5, updated_at = NOW()
       WHERE task_id = $1
       RETURNING *`,
      [taskId, imageUrl, note.trim(), officerId, type],
    );
    proofRow = updateRes.rows[0];
  } else {
    // Insert new task_completion
    const imgField = type === "invalidation" ? "before_image_url" : "after_image_url";
    const otherField = type === "invalidation" ? "after_image_url" : "before_image_url";
    const res = await pool.query(
      `INSERT INTO task_completions (task_id, completed_by_officer_id, description, ${imgField}, ${otherField}, proof_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [taskId, officerId, note.trim(), imageUrl, type === "invalidation" ? imageUrl : null, type],
    );
    proofRow = res.rows[0];
  }

  // Log activity
  await logOfficerActivity(taskId, officerId, "proof_uploaded", {
    type,
    note: note?.trim() || null,
  });

  // Return in mobile-friendly format
  return {
    proof: {
      id: proofRow.id,
      task_id: proofRow.task_id,
      officer_id: proofRow.completed_by_officer_id,
      type,
      image_url: proofRow.after_image_url || proofRow.before_image_url,
      note: proofRow.description,
      created_at: proofRow.created_at,
    },
  };
}

// ─── Reports ───────────────────────────────────────────────────────────

export async function getOfficerReports(officerId: string, wardId?: number) {
  const scope = await resolveOfficerAccessScope(officerId);
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (scope.officerType === "municipality_officer" && scope.municipalityId) {
    conditions.push(`w.municipality_id::text = $${idx++}`);
    params.push(scope.municipalityId);
  } else {
    conditions.push(`r.assigned_field_officer_id::text = $${idx++}`);
    params.push(officerId);
  }

  if (wardId) {
    conditions.push(`r.ward_id::text = $${idx++}`);
    params.push(String(wardId));
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const res = await pool.query(
    `SELECT r.id, r.title, r.description, r.category,
            r.status, r.media_url, r.photo_urls, r.address_text,
            r.location_lat, r.location_lng, r.submitted_at, r.created_at,
            r.upvote_count, r.comment_count,
            r.assigned_level,
            r.escalated_to_municipality,
            w.name AS ward_name,
            m.name AS municipality_name
     FROM reports r
     LEFT JOIN wards w ON w.id::text = r.ward_id::text
     LEFT JOIN municipalities m ON m.id::text = w.municipality_id::text
     ${where}
     ORDER BY r.submitted_at DESC, r.created_at DESC`,
    params,
  );

  return { reports: res.rows };
}

export async function getOfficerReportDetail(reportId: string, officerId: string) {
  const res = await pool.query(
    `SELECT r.id, r.title, r.description, r.category,
            r.status, r.media_url, r.photo_urls, r.address_text,
            r.location_lat, r.location_lng, r.submitted_at, r.created_at,
            r.upvote_count, r.comment_count, r.is_public,
            w.name AS ward_name,
            u.name AS reporter_name
     FROM reports r
     LEFT JOIN wards w ON w.id::text = r.ward_id::text
     LEFT JOIN users u ON u.id::text = r.user_id::text
     WHERE r.id::text = $1`,
    [reportId],
  );

  if (res.rows.length === 0) {
    throw new AppError("Report not found", 404);
  }

  // Get comments
  const commentsRes = await pool.query(
    `SELECT c.id, c.user_id,
            c.officer_id,
            c.public_tag,
            c.content, c.created_at,
            COALESCE(c.public_tag, u.name, o.first_name || ' ' || o.last_name) AS author_name,
            CASE
              WHEN c.officer_id IS NOT NULL THEN 'officer'
              ELSE COALESCE(u.role, 'officer')
            END AS author_role,
            COALESCE(u.profile_image_url, o.profile_image_url) AS author_avatar,
            COALESCE(u.ward_id::text, o.ward_id::text) AS author_ward_id,
            w.name AS author_ward_name
     FROM comments c
     LEFT JOIN users u ON u.id::text = c.user_id::text
     LEFT JOIN officers o ON o.id::text = c.officer_id::text
     LEFT JOIN wards w ON w.id::text = COALESCE(u.ward_id::text, o.ward_id::text)
     WHERE c.report_id::text = $1
     ORDER BY c.created_at ASC`,
    [reportId],
  );

  return {
    report: res.rows[0],
    comments: commentsRes.rows,
  };
}

export async function addReportComment(
  reportId: string,
  officerId: string,
  content: string,
  publicTag: string,
) {
  const res = await pool.query(
    `INSERT INTO comments (report_id, user_id, officer_id, public_tag, content)
     VALUES ($1, NULL, $2, $3, $4)
     RETURNING *`,
    [reportId, officerId, publicTag, content],
  );

  // Increment comment count
  await pool.query(
    `UPDATE reports SET comment_count = comment_count + 1 WHERE id = $1`,
    [reportId],
  );

  await notifyNewComment(reportId, officerId, content);

  return { comment: { ...res.rows[0], public_tag: publicTag }, publicTag };
}

// ─── Task Comments ─────────────────────────────────────────────────────

export async function addTaskComment(
  taskId: string,
  officerId: string,
  content: string,
  publicTag: string,
) {
  // Tasks are reports — comments go into the same comments table
  const res = await pool.query(
    `INSERT INTO comments (report_id, user_id, officer_id, public_tag, content)
     VALUES ($1, NULL, $2, $3, $4)
     RETURNING *`,
    [taskId, officerId, publicTag, content],
  );

  // Increment comment count
  await pool.query(
    `UPDATE reports SET comment_count = comment_count + 1 WHERE id = $1`,
    [taskId],
  );

  // Log activity
  await logOfficerActivity(taskId, officerId, "comment_added", {
    comment_id: res.rows[0]?.id ?? null,
    public_tag: publicTag,
  });

  await notifyNewComment(taskId, officerId, content);

  return { comment: { ...res.rows[0], public_tag: publicTag } };
}

// ─── Notifications ─────────────────────────────────────────────────────

export async function getOfficerNotifications(officerId: string, unreadOnly?: boolean) {
  const conditions = [`COALESCE(n.officer_id::text, n.user_id::text) = $1`];
  if (unreadOnly) conditions.push(`n.is_read = false`);

  const res = await pool.query(
    `SELECT n.id,
            COALESCE(n.officer_id::text, n.user_id::text) AS recipient_id,
            n.type, n.title,
            n.message AS body, n.report_id AS related_report_id,
            COALESCE(
              NULLIF(split_part(n.link, '/officer-task/', 2), ''),
              NULLIF(split_part(n.link, '/report-post/', 2), ''),
              NULLIF(n.metadata->>'taskId', ''),
              NULLIF(n.metadata->>'reportId', ''),
              n.report_id::text
            ) AS related_task_id,
            n.link, n.metadata, n.is_read, n.created_at,
            r.title AS report_title
     FROM notifications n
     LEFT JOIN reports r ON r.id = n.report_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY n.created_at DESC
     LIMIT 100`,
    [officerId],
  );

  return { notifications: res.rows };
}

export async function getOfficerUnreadCount(officerId: string) {
  const res = await pool.query(
    `SELECT COUNT(*)::int AS count FROM notifications
     WHERE COALESCE(officer_id::text, user_id::text) = $1
       AND is_read = false`,
    [officerId],
  );
  return { count: res.rows[0].count };
}

export async function markOfficerNotificationRead(notifId: string, officerId: string) {
  await pool.query(
    `UPDATE notifications SET is_read = true
     WHERE id = $1
       AND COALESCE(officer_id::text, user_id::text) = $2`,
    [notifId, officerId],
  );
  return { success: true };
}

export async function markAllOfficerNotificationsRead(officerId: string) {
  const res = await pool.query(
    `UPDATE notifications SET is_read = true
     WHERE COALESCE(officer_id::text, user_id::text) = $1
       AND is_read = false`,
    [officerId],
  );
  return { updated: res.rowCount };
}

// ─── History ───────────────────────────────────────────────────────────

export async function getOfficerHistory(officerId: string, type?: string) {
  const conditions = [`r.assigned_field_officer_id = $1`];

  if (type === "completed") {
    conditions.push(`r.status = 'completed'`);
  }

  const res = await pool.query(
    `SELECT r.id, r.title, r.category, r.address_text AS location_text,
            r.status, r.priority,
            r.submitted_at AS assigned_at,
            r.actual_completion_date AS completed_at,
            w.name AS ward_name,
            od.name AS department_name,
            (SELECT COUNT(*)::int FROM task_completions tc WHERE tc.task_id = r.id) AS proof_count
     FROM reports r
     LEFT JOIN wards w ON w.id::text = r.ward_id::text
     LEFT JOIN officer_departments od ON od.id::text = r.assigned_department_id::text
     WHERE ${conditions.join(" AND ")}
     ORDER BY COALESCE(r.actual_completion_date, r.submitted_at) DESC`,
    [officerId],
  );

  // Map status
  const history = res.rows.map((row: any) => ({
    ...row,
    status: toMobileStatus(row.status),
  }));

  return { history };
}

// ─── Profile ───────────────────────────────────────────────────────────

export async function getOfficerProfile(officerId: string) {
  const scope = await resolveOfficerAccessScope(officerId);
  // Try officers table first
  const officerRes = await pool.query(
    `SELECT o.id, o.first_name, o.last_name, o.email, o.profile_image_url,
            o.created_at, o.ward_id, o.department_id, o.type,
            o.must_change_password,
            w.name AS ward_name,
            od.name AS department_name,
            (SELECT COUNT(*)::int FROM reports r WHERE r.assigned_field_officer_id = o.id) AS total_tasks,
            (SELECT COUNT(*)::int FROM reports r WHERE r.assigned_field_officer_id = o.id AND r.status = 'completed') AS completed_tasks,
            (SELECT COUNT(*)::int FROM reports r WHERE r.assigned_field_officer_id = o.id AND r.status = 'in_progress') AS active_tasks
     FROM officers o
     LEFT JOIN wards w ON w.id = o.ward_id
     LEFT JOIN officer_departments od ON od.id = o.department_id
     WHERE o.id = $1 AND o.deleted_at IS NULL`,
    [officerId],
  );

  if (officerRes.rows.length > 0) {
    const row = officerRes.rows[0];
    if (row.type === "municipality_officer" && scope.municipalityId) {
      const statsRes = await pool.query(
        `SELECT COUNT(*)::int AS total_tasks,
                COUNT(*) FILTER (WHERE r.status IN ('incoming', 'returned'))::int AS incoming_tasks,
                COUNT(*) FILTER (WHERE r.status = 'in_progress')::int AS active_tasks,
                COUNT(*) FILTER (WHERE r.status = 'completed')::int AS completed_tasks,
                COUNT(*) FILTER (WHERE r.status = 'invalid')::int AS invalid_tasks
         FROM reports r
         LEFT JOIN wards w ON w.id::text = r.ward_id::text
         WHERE w.municipality_id::text = $1`,
        [scope.municipalityId],
      );

      const stats = statsRes.rows[0];
      return {
        profile: {
          ...row,
          name: `${row.first_name} ${row.last_name}`.trim(),
          role: "officer",
          municipality_id: scope.municipalityId,
          municipality_name: scope.municipalityName,
          scope_source: scope.scopeSource,
          total_tasks: stats.total_tasks,
          incoming_tasks: stats.incoming_tasks,
          completed_tasks: stats.completed_tasks,
          active_tasks: stats.active_tasks,
          invalid_tasks: stats.invalid_tasks,
        },
      };
    }

    return {
      profile: {
        ...row,
        name: `${row.first_name} ${row.last_name}`.trim(),
        role: "officer",
        municipality_id: scope.municipalityId,
        municipality_name: scope.municipalityName,
        scope_source: scope.scopeSource,
        incoming_tasks: 0,
        invalid_tasks: 0,
      },
    };
  }

  // Fallback to users table
  const userRes = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.profile_image_url,
            u.created_at, u.ward_id,
            (SELECT COUNT(*)::int FROM reports r WHERE r.assigned_field_officer_id = u.id) AS total_tasks,
            (SELECT COUNT(*)::int FROM reports r WHERE r.assigned_field_officer_id = u.id AND r.status = 'completed') AS completed_tasks,
            (SELECT COUNT(*)::int FROM reports r WHERE r.assigned_field_officer_id = u.id AND r.status = 'in_progress') AS active_tasks
     FROM users u
     WHERE u.id = $1 AND u.role = 'officer'`,
    [officerId],
  );

  if (userRes.rows.length === 0) {
    throw new AppError("Officer profile not found", 404);
  }

  return { profile: userRes.rows[0] };
}

export async function updateOfficerPhoto(officerId: string, imageUrl: string) {
  // Try officers table first
  const officerRes = await pool.query(
    `UPDATE officers SET profile_image_url = $2, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [officerId, imageUrl],
  );

  if (officerRes.rows.length === 0) {
    // Fallback to users table
    await pool.query(
      `UPDATE users SET profile_image_url = $2 WHERE id = $1`,
      [officerId, imageUrl],
    );
  }

  return { success: true, profile_image_url: imageUrl };
}

// ─── Password Change ──────────────────────────────────────────────────

export async function changeOfficerPassword(
  officerId: string,
  oldPassword: string,
  newPassword: string,
) {
  // Try officers table first, then users table
  let res = await pool.query(
    `SELECT password_hash FROM officers WHERE id = $1 AND deleted_at IS NULL`,
    [officerId],
  );
  let table = "officers";

  if (res.rows.length === 0) {
    res = await pool.query(
      `SELECT password_hash FROM users WHERE id = $1`,
      [officerId],
    );
    table = "users";
  }

  if (res.rows.length === 0) {
    throw new AppError("User not found", 404);
  }

  const ok = await bcrypt.compare(oldPassword, res.rows[0].password_hash);
  if (!ok) {
    throw new AppError("Current password is incorrect", 400);
  }

  if (newPassword.length < 6) {
    throw new AppError("New password must be at least 6 characters", 400);
  }

  const hash = await bcrypt.hash(newPassword, 12);

  if (table === "officers") {
    await pool.query(
      `UPDATE officers SET password_hash = $2, must_change_password = false, password_changed_at = NOW() WHERE id = $1`,
      [officerId, hash],
    );
  } else {
    await pool.query(
      `UPDATE users SET password_hash = $2 WHERE id = $1`,
      [officerId, hash],
    );
  }

  return { success: true, message: "Password changed successfully" };
}

// ─── Build Public Tag ──────────────────────────────────────────────────

export async function getOfficerPublicTag(officerId: string): Promise<string> {
  // Try officers table first
  const officerRes = await pool.query(
    `SELECT o.type, o.ward_id, w.name AS ward_name
     FROM officers o
     LEFT JOIN wards w ON w.id = o.ward_id
     WHERE o.id = $1 AND o.deleted_at IS NULL`,
    [officerId],
  );

  if (officerRes.rows.length > 0) {
    const row = officerRes.rows[0];
    if (row.ward_id && row.ward_name) {
      return `${row.ward_name} Officer`;
    }
    if (row.type === "municipality_officer") {
      return "Municipality Officer";
    }
    return "Officer";
  }

  // Fallback to users table
  const userRes = await pool.query(
    `SELECT u.role, u.ward_id, w.name AS ward_name
     FROM users u
     LEFT JOIN wards w ON w.id = u.ward_id
     WHERE u.id = $1`,
    [officerId],
  );

  if (userRes.rows.length === 0) return "Officer";

  const row = userRes.rows[0];
  if (row.ward_id && row.ward_name) {
    return `${row.ward_name} Officer`;
  }
  return "Officer";
}
