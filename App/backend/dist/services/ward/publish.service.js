// src/services/ward/publish.service.ts
import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";
const CYCLE_DAYS = 7;
async function getWardPublishingSchemaStatus() {
    const { rows } = await pool.query(`SELECT
       to_regclass('public.ward_published_reports') IS NOT NULL AS has_published_reports,
       to_regclass('public.ward_publish_schedule') IS NOT NULL AS has_publish_schedule`);
    return {
        hasPublishedReports: Boolean(rows[0]?.has_published_reports),
        hasPublishSchedule: Boolean(rows[0]?.has_publish_schedule),
    };
}
async function ensureWardPublishingSchema() {
    const status = await getWardPublishingSchemaStatus();
    if (!status.hasPublishedReports || !status.hasPublishSchedule) {
        throw new AppError("Ward publishing is not configured yet. Please run the publishing database migration.", 503);
    }
    return status;
}
/** Get current snapshot of all tasks in a ward */
async function getWardTaskSnapshot(wardId) {
    const { rows } = await pool.query(`SELECT r.report_id, r.title, r.category, r.status,
            r.assigned_to, u.name AS officer_name,
            d.name AS department_name,
            r.created_at, r.updated_at
     FROM reports r
     LEFT JOIN users u ON u.id = r.assigned_to
     LEFT JOIN officer_departments od ON od.officer_id = r.assigned_to
     LEFT JOIN departments d ON d.id = od.department_id
     WHERE r.ward_id = $1
     ORDER BY r.created_at DESC`, [wardId]);
    return rows;
}
/** Get the last published report for a ward */
async function getLastPublished(wardId) {
    const { rows } = await pool.query(`SELECT id, report_snapshot, published_at
     FROM ward_published_reports
     WHERE ward_id = $1
     ORDER BY published_at DESC
     LIMIT 1`, [wardId]);
    return rows[0] || null;
}
/** Compare current snapshot to previous and detect changes */
function detectChanges(current, previousSnapshot) {
    if (!previousSnapshot || previousSnapshot.length === 0) {
        return {
            new_tasks: current.length,
            status_changes: [],
            total_changes: current.length,
        };
    }
    const prevMap = new Map(previousSnapshot.map((t) => [t.report_id, t]));
    const newTasks = [];
    const statusChanges = [];
    for (const task of current) {
        const prev = prevMap.get(task.report_id);
        if (!prev) {
            newTasks.push(task);
        }
        else if (prev.status !== task.status) {
            statusChanges.push({
                report_id: task.report_id,
                title: task.title,
                old_status: prev.status,
                new_status: task.status,
            });
        }
    }
    return {
        new_tasks: newTasks.length,
        status_changes: statusChanges,
        total_changes: newTasks.length + statusChanges.length,
    };
}
/** Generate human-readable summary */
function generateSummary(snapshot, changes) {
    const total = snapshot.length;
    const planned = snapshot.filter((t) => t.status === "submitted").length;
    const inProgress = snapshot.filter((t) => t.status === "in_progress" || t.status === "under_review").length;
    const completed = snapshot.filter((t) => t.status === "resolved").length;
    const closed = snapshot.filter((t) => t.status === "closed").length;
    const lines = [];
    lines.push(`Total tasks: ${total}`);
    lines.push("");
    lines.push(`Planned work: ${planned} task${planned !== 1 ? "s" : ""} awaiting action`);
    lines.push(`In progress: ${inProgress} task${inProgress !== 1 ? "s" : ""} being worked on`);
    lines.push(`Completed: ${completed} task${completed !== 1 ? "s" : ""} resolved`);
    if (closed > 0)
        lines.push(`Closed: ${closed} task${closed !== 1 ? "s" : ""} marked invalid`);
    if (changes.total_changes > 0) {
        lines.push("");
        lines.push("Changes since last report:");
        if (changes.new_tasks > 0) {
            lines.push(`  ${changes.new_tasks} new task${changes.new_tasks !== 1 ? "s" : ""} received`);
        }
        for (const sc of changes.status_changes.slice(0, 10)) {
            const oldLabel = friendlyStatus(sc.old_status);
            const newLabel = friendlyStatus(sc.new_status);
            lines.push(`  "${sc.title}" moved from ${oldLabel} to ${newLabel}`);
        }
        if (changes.status_changes.length > 10) {
            lines.push(`  ...and ${changes.status_changes.length - 10} more changes`);
        }
    }
    // Departments involved
    const depts = [...new Set(snapshot.filter((t) => t.department_name).map((t) => t.department_name))];
    if (depts.length > 0) {
        lines.push("");
        lines.push(`Departments involved: ${depts.join(", ")}`);
    }
    return lines.join("\n");
}
function friendlyStatus(status) {
    const map = {
        submitted: "Planned",
        under_review: "Under Review",
        in_progress: "In Progress",
        resolved: "Completed",
        closed: "Closed",
    };
    return map[status] || status;
}
/** Get publish status: days remaining, can publish, etc. */
export async function getPublishStatus(wardId) {
    await ensureWardPublishingSchema();
    const scheduleRes = await pool.query(`SELECT last_published_at, next_auto_publish_at, cycle_days
     FROM ward_publish_schedule
     WHERE ward_id = $1`, [wardId]);
    let schedule = scheduleRes.rows[0];
    // Initialize if missing
    if (!schedule) {
        await pool.query(`INSERT INTO ward_publish_schedule (ward_id, next_auto_publish_at, cycle_days)
       VALUES ($1, NOW() + INTERVAL '7 days', 7)
       ON CONFLICT (ward_id) DO NOTHING`, [wardId]);
        schedule = {
            last_published_at: null,
            next_auto_publish_at: new Date(Date.now() + CYCLE_DAYS * 86400000),
            cycle_days: CYCLE_DAYS,
        };
    }
    const nextAutoPublish = schedule.next_auto_publish_at
        ? new Date(schedule.next_auto_publish_at)
        : new Date(Date.now() + CYCLE_DAYS * 86400000);
    const now = new Date();
    const msRemaining = Math.max(0, nextAutoPublish.getTime() - now.getTime());
    const daysRemaining = Math.ceil(msRemaining / 86400000);
    return {
        last_published_at: schedule.last_published_at,
        next_auto_publish_at: nextAutoPublish.toISOString(),
        days_remaining: daysRemaining,
        cycle_days: schedule.cycle_days || CYCLE_DAYS,
    };
}
/** Get preview of what would be published */
export async function getPublishPreview(wardId) {
    await ensureWardPublishingSchema();
    const status = await getPublishStatus(wardId);
    const currentSnapshot = await getWardTaskSnapshot(wardId);
    const lastPublished = await getLastPublished(wardId);
    const previousSnapshot = lastPublished?.report_snapshot;
    const changes = detectChanges(currentSnapshot, previousSnapshot);
    const canPublish = changes.total_changes > 0;
    const reason = canPublish
        ? undefined
        : "No meaningful changes since the last published report. At least one task must have changed status or a new task must exist.";
    const summary = generateSummary(currentSnapshot, changes);
    return {
        can_publish: canPublish,
        reason,
        days_remaining: status.days_remaining,
        next_auto_publish: status.next_auto_publish_at,
        current_snapshot: currentSnapshot,
        changes_since_last: changes,
        summary,
    };
}
/** Publish a ward report */
export async function publishWardReport(wardId, publishedBy) {
    await ensureWardPublishingSchema();
    const preview = await getPublishPreview(wardId);
    if (!preview.can_publish) {
        throw new AppError(preview.reason || "Cannot publish: no changes since last report", 400);
    }
    const lastPublished = await getLastPublished(wardId);
    const now = new Date();
    const cycleStart = lastPublished?.published_at
        ? new Date(lastPublished.published_at)
        : new Date(now.getTime() - CYCLE_DAYS * 86400000);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // Insert published report
        const { rows } = await client.query(`INSERT INTO ward_published_reports
       (ward_id, published_by, cycle_start, cycle_end, is_auto_published, report_snapshot, previous_snapshot, summary_text)
       VALUES ($1, $2, $3, $4, FALSE, $5, $6, $7)
       RETURNING id, published_at`, [
            wardId,
            publishedBy,
            cycleStart.toISOString(),
            now.toISOString(),
            JSON.stringify(preview.current_snapshot),
            lastPublished ? JSON.stringify(lastPublished.report_snapshot) : null,
            preview.summary,
        ]);
        // Reset auto-publish timer
        await client.query(`UPDATE ward_publish_schedule
       SET last_published_at = NOW(),
           next_auto_publish_at = NOW() + INTERVAL '${CYCLE_DAYS} days',
           updated_at = NOW()
       WHERE ward_id = $1`, [wardId]);
        await client.query("COMMIT");
        return {
            id: rows[0].id,
            published_at: rows[0].published_at,
            summary: preview.summary,
        };
    }
    catch (err) {
        await client.query("ROLLBACK");
        throw err;
    }
    finally {
        client.release();
    }
}
/** List published reports for a ward */
export async function listPublishedReports(wardId, page = 1, limit = 10) {
    await ensureWardPublishingSchema();
    const offset = (page - 1) * limit;
    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM ward_published_reports WHERE ward_id = $1`, [wardId]);
    const total = countRes.rows[0]?.total ?? 0;
    const { rows } = await pool.query(`SELECT id, published_at, cycle_start, cycle_end, is_auto_published, summary_text,
            (SELECT name FROM users WHERE id = published_by) AS published_by_name
     FROM ward_published_reports
     WHERE ward_id = $1
     ORDER BY published_at DESC
     LIMIT $2 OFFSET $3`, [wardId, limit, offset]);
    return {
        reports: rows,
        pagination: {
            page,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}
/** List all published reports across all wards (public feed) */
export async function listPublicPublishedReports(page = 1, limit = 10) {
    const schema = await getWardPublishingSchemaStatus();
    if (!schema.hasPublishedReports) {
        return {
            reports: [],
            pagination: {
                page,
                total: 0,
                totalPages: 0,
            },
        };
    }
    const offset = (page - 1) * limit;
    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM ward_published_reports`);
    const total = countRes.rows[0]?.total ?? 0;
    const { rows } = await pool.query(`SELECT wpr.id, wpr.published_at, wpr.cycle_start, wpr.cycle_end,
            wpr.is_auto_published, wpr.summary_text, wpr.report_snapshot,
            w.name AS ward_name,
            (SELECT name FROM users WHERE id = wpr.published_by) AS published_by_name
     FROM ward_published_reports wpr
     JOIN wards w ON w.ward_id = wpr.ward_id
     ORDER BY wpr.published_at DESC
     LIMIT $1 OFFSET $2`, [limit, offset]);
    return {
        reports: rows.map((r) => {
            const snapshot = r.report_snapshot;
            const planned = snapshot.filter((t) => t.status === "submitted").length;
            const inProgress = snapshot.filter((t) => ["in_progress", "under_review"].includes(t.status)).length;
            const completed = snapshot.filter((t) => t.status === "resolved").length;
            const closed = snapshot.filter((t) => t.status === "closed").length;
            return {
                id: r.id,
                ward_name: r.ward_name,
                published_at: r.published_at,
                period_start: r.cycle_start,
                period_end: r.cycle_end,
                is_auto_published: r.is_auto_published,
                published_by_name: r.published_by_name,
                summary_text: r.summary_text,
                overview: {
                    total_tasks: snapshot.length,
                    planned,
                    in_progress: inProgress,
                    completed,
                    closed,
                },
            };
        }),
        pagination: {
            page,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}
/** Get a single published report (public, human-readable) */
export async function getPublicPublishedReport(reportId) {
    const schema = await getWardPublishingSchemaStatus();
    if (!schema.hasPublishedReports) {
        return null;
    }
    const { rows } = await pool.query(`SELECT wpr.id, wpr.ward_id, wpr.published_at, wpr.cycle_start, wpr.cycle_end,
            wpr.is_auto_published, wpr.report_snapshot, wpr.previous_snapshot,
            wpr.summary_text,
            w.name AS ward_name
     FROM ward_published_reports wpr
     JOIN wards w ON w.ward_id = wpr.ward_id
     WHERE wpr.id = $1`, [reportId]);
    if (rows.length === 0)
        return null;
    const report = rows[0];
    const snapshot = report.report_snapshot;
    const prevSnapshot = report.previous_snapshot;
    const changes = detectChanges(snapshot, prevSnapshot);
    // Build human-readable format
    const planned = snapshot.filter((t) => t.status === "submitted");
    const inProgress = snapshot.filter((t) => ["in_progress", "under_review"].includes(t.status));
    const completed = snapshot.filter((t) => t.status === "resolved");
    const closed = snapshot.filter((t) => t.status === "closed");
    return {
        id: report.id,
        ward_name: report.ward_name,
        published_at: report.published_at,
        period: {
            from: report.cycle_start,
            to: report.cycle_end,
        },
        overview: {
            total_tasks: snapshot.length,
            planned: planned.length,
            in_progress: inProgress.length,
            completed: completed.length,
            closed: closed.length,
        },
        sections: {
            planned_work: planned.map((t) => ({
                title: t.title,
                category: t.category,
                department: t.department_name,
            })),
            in_progress: inProgress.map((t) => ({
                title: t.title,
                category: t.category,
                officer: t.officer_name,
                department: t.department_name,
            })),
            completed_work: completed.map((t) => ({
                title: t.title,
                category: t.category,
                officer: t.officer_name,
                department: t.department_name,
            })),
        },
        changes_since_last_report: {
            new_tasks: changes.new_tasks,
            status_updates: changes.status_changes.map((sc) => ({
                title: sc.title,
                from: friendlyStatus(sc.old_status),
                to: friendlyStatus(sc.new_status),
            })),
        },
        summary_text: report.summary_text,
    };
}
