import { pool } from "@/db/pool";
import { uploadBufferToCloudinary } from "@/lib/upload.cloudinary";
import { AppError } from "@/lib/errors";
import { REPORT_PRIORITY_CONFIG } from "@/config/reportPriority";
import { verifyPrioritySuggestionToken } from "@/services/ai/prioritySuggestionToken";
import { detectWard } from "@/services/ward/ward.service";
function toNullableNumber(v) {
    if (v === undefined || v === null || v === "")
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
async function findInitialKanbanColumn(client, role) {
    const { rows } = await client.query(`SELECT id, deadline_days
     FROM kanban_columns
     WHERE mapped_status = 'incoming'
       AND (
         role_access @> ARRAY[$1::user_role]
         OR COALESCE(array_length(role_access, 1), 0) = 0
       )
     ORDER BY
       CASE WHEN role_access @> ARRAY[$1::user_role] THEN 0 ELSE 1 END,
       position ASC,
       created_at ASC
     LIMIT 1`, [role]);
    return rows[0] ?? null;
}
// ─── Create Report ──────────────────────
export async function createReportService(input) {
    const { userId, deviceId, fileBuffer, mediaType, title, description, category, isPublic, locationLat, locationLng, locationAccuracyM, address, aiPriorityToken, } = input;
    if (mediaType !== "photo" && mediaType !== "video") {
        throw new Error("Invalid media_type (must be photo or video)");
    }
    const lat = toNullableNumber(locationLat);
    const lng = toNullableNumber(locationLng);
    const acc = toNullableNumber(locationAccuracyM);
    const verifiedPriority = verifyPrioritySuggestionToken(aiPriorityToken, fileBuffer);
    if (aiPriorityToken && !verifiedPriority) {
        throw new AppError("Invalid AI priority suggestion for this media.", 400);
    }
    const reportPriority = verifiedPriority ?? REPORT_PRIORITY_CONFIG.defaultLevel;
    // 1) Upload to Cloudinary
    const upload = await uploadBufferToCloudinary({
        buffer: fileBuffer,
        folder: "reports",
        resourceType: mediaType === "photo" ? "image" : "video",
    });
    // 2) Detect ward from coordinates
    let wardId = null;
    let wardName = null;
    if (lat != null && lng != null) {
        const ward = await detectWard(lat, lng);
        if (ward) {
            wardId = ward.wardId;
            wardName = ward.wardName;
        }
    }
    // 3) Insert report
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const initialColumn = await findInitialKanbanColumn(client, wardId ? "ward" : "admin");
        const now = new Date();
        const incomingAckDeadlineAt = wardId
            ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
            : null;
        const q = `
      INSERT INTO reports (
        user_id,           -- ✅ This is the correct column name
        title, 
        description,
        category, 
        is_public,
        media_url, 
        media_public_id, 
        media_type,
        location_lat, 
        location_lng, 
        location_accuracy_m,
        address_text, 
        ward_id,
        kanban_column_id,
        assigned_level,
        ward_received_at,
        incoming_seen_at,
        incoming_ack_deadline_at,
        ward_deadline_at,
        device_id,
        priority,
        photo_urls
        -- ✅ Removed pathway_type and pathway_reason (nullable now)
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      RETURNING
        id,
        user_id,           -- ✅ Return user_id, not duplicate id
        title, 
        description,
        category, 
        is_public, 
        status,
        media_url, 
        media_public_id, 
        media_type,
        location_lat, 
        location_lng, 
        location_accuracy_m,
        address_text, 
        ward_id, 
        kanban_column_id,
        assigned_level,
        priority,
        incoming_ack_deadline_at,
        submitted_at,
        created_at
    `;
        const photoUrls = mediaType === "photo" ? [upload.secure_url] : [];
        const values = [
            userId, // $1
            title?.trim() || null, // $2
            description?.trim() || null, // $3
            category || "General", // $4
            isPublic ?? true, // $5
            upload.secure_url, // $6
            upload.public_id, // $7
            mediaType, // $8
            lat, // $9
            lng, // $10
            acc, // $11
            address?.trim() || null, // $12
            wardId, // $13
            initialColumn?.id ?? null, // $14
            "ward", // $15
            wardId ? now : null, // $16
            null, // $17 incoming_seen_at
            incomingAckDeadlineAt, // $18 incoming_ack_deadline_at
            null, // $19 ward_deadline_at starts when active work begins
            deviceId || null, // $20
            reportPriority, // $21
            JSON.stringify(photoUrls), // $22
            // ✅ Removed pathway values
        ];
        const { rows } = await client.query(q, values);
        const report = rows[0];
        // If anonymous and deviceId provided, track in junction table
        if (userId === null && deviceId) {
            await client.query(`INSERT INTO anonymous_reports (report_id, device_id) VALUES ($1, $2)`, [report.id, deviceId]);
        }
        await client.query("COMMIT");
        return { ...report, ward_name: wardName };
    }
    catch (err) {
        await client.query("ROLLBACK");
        throw err;
    }
    finally {
        client.release();
    }
}
// ─── List My Reports ─────────────────────────────────────────────────
export async function listMyReportsService(params) {
    const { userId } = params;
    const q = `
    SELECT
      r.id,
      r.user_id,         -- ✅ Select user_id, not duplicate id
      r.title, 
      r.description,
      r.category, 
      r.is_public, 
      r.status,
      r.media_url, 
      r.media_type,
      r.photo_urls,
      r.location_lat, 
      r.location_lng, 
      r.location_accuracy_m,
      r.address_text,
      r.upvote_count, 
      r.comment_count,
      r.submitted_at,
      r.created_at,
      w.name as ward_name,
      w.ward_code
    FROM reports r
    LEFT JOIN wards w ON r.ward_id = w.id
    WHERE r.user_id = $1     -- ✅ Filter by user_id, not id
    ORDER BY r.created_at DESC
    LIMIT 100
  `;
    const { rows } = await pool.query(q, [userId]);
    return rows;
}
function timeRangeToInterval(range) {
    switch (range) {
        case "24h": return "24 hours";
        case "7d": return "7 days";
        case "30d": return "30 days";
        default: return null;
    }
}
function normalizeCategoryFilter(value) {
    if (!value)
        return [];
    if (Array.isArray(value)) {
        return value.map((v) => v.trim()).filter(Boolean);
    }
    return value.split(",").map((v) => v.trim()).filter(Boolean);
}
// ─── Find Similar / Duplicate Reports ────────────────────────
export async function findSimilarReports(lat, lng, category, radiusM = 500, limitRows = 5, actorId, actorRole) {
    const isOfficerActor = actorRole === "officer";
    const viewerUpvoteSelect = actorId
        ? isOfficerActor
            ? `, EXISTS(SELECT 1 FROM upvotes WHERE report_id = r.id AND officer_id = $6) AS user_upvoted`
            : `, EXISTS(SELECT 1 FROM upvotes WHERE report_id = r.id AND user_id = $6) AS user_upvoted`
        : `, FALSE AS user_upvoted`;
    const query = `SELECT
       r.id, r.title, r.description, r.category, r.status,
       r.media_url, r.photo_urls, r.upvote_count, r.address_text,
       r.submitted_at, r.created_at,
       w.name AS ward_name,
       ROUND(
         (6371000 * acos(least(1, greatest(-1,
           cos(radians($1)) * cos(radians(r.location_lat)) *
           cos(radians(r.location_lng) - radians($2)) +
           sin(radians($1)) * sin(radians(r.location_lat))
         )))))::int AS distance_m
       ${viewerUpvoteSelect}
     FROM reports r
     LEFT JOIN wards w ON r.ward_id = w.id
     WHERE r.is_public = TRUE
       AND r.status IN ('incoming','in_progress')
       AND r.category = $3
       AND r.location_lat IS NOT NULL
       AND r.location_lng IS NOT NULL
       AND r.submitted_at >= NOW() - INTERVAL '30 days'
       AND (6371000 * acos(least(1, greatest(-1,
         cos(radians($1)) * cos(radians(r.location_lat)) *
         cos(radians(r.location_lng) - radians($2)) +
         sin(radians($1)) * sin(radians(r.location_lat))
       )))) <= $4
     ORDER BY distance_m ASC
     LIMIT $5`;
    const params = [lat, lng, category, radiusM, limitRows];
    if (actorId)
        params.push(actorId);
    const { rows } = await pool.query(query, params);
    return rows;
}
export async function listPublicReportsService(params) {
    const { page, limit, category, timeRange, userLat, userLng, radius, bounds, status, escalated, actorId, actorRole, } = params;
    const offset = (page - 1) * limit;
    const conditions = ["r.is_public = TRUE"];
    const values = [];
    let paramIdx = 1;
    // Escalated filter — overrides status
    if (escalated) {
        conditions.push(`r.escalated_to_municipality = TRUE`);
    }
    else if (status) {
        // Status filter
        const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
        if (statuses.length === 1) {
            conditions.push(`r.status = $${paramIdx}`);
            values.push(statuses[0]);
            paramIdx++;
        }
        else if (statuses.length > 1) {
            conditions.push(`r.status = ANY($${paramIdx})`);
            values.push(statuses);
            paramIdx++;
        }
    }
    const categories = normalizeCategoryFilter(category);
    if (categories.length === 1) {
        conditions.push(`r.category = $${paramIdx}`);
        values.push(categories[0]);
        paramIdx++;
    }
    else if (categories.length > 1) {
        conditions.push(`r.category = ANY($${paramIdx})`);
        values.push(categories);
        paramIdx++;
    }
    const interval = timeRangeToInterval(timeRange);
    if (interval) {
        conditions.push(`r.submitted_at >= NOW() - INTERVAL '${interval}'`);
    }
    if (bounds) {
        conditions.push(`r.location_lat BETWEEN $${paramIdx} AND $${paramIdx + 1}`);
        values.push(bounds.swLat, bounds.neLat);
        paramIdx += 2;
        conditions.push(`r.location_lng BETWEEN $${paramIdx} AND $${paramIdx + 1}`);
        values.push(bounds.swLng, bounds.neLng);
        paramIdx += 2;
    }
    if (Number.isFinite(userLat) &&
        Number.isFinite(userLng) &&
        Number.isFinite(radius) &&
        Number(radius) > 0) {
        conditions.push(`r.location_lat IS NOT NULL AND r.location_lng IS NOT NULL AND
       (6371000 * acos(least(1, greatest(-1,
        cos(radians($${paramIdx})) * cos(radians(r.location_lat)) *
        cos(radians(r.location_lng) - radians($${paramIdx + 1})) +
        sin(radians($${paramIdx})) * sin(radians(r.location_lat))
       )))) <= $${paramIdx + 2}`);
        values.push(Number(userLat), Number(userLng), Number(radius));
        paramIdx += 3;
    }
    const whereClause = conditions.join(" AND ");
    const countQ = `SELECT COUNT(*)::int AS total FROM reports r WHERE ${whereClause}`;
    const countResult = await pool.query(countQ, values);
    const totalCount = countResult.rows[0].total;
    const isOfficerActor = actorRole === "officer";
    const viewerUpvoteSelect = actorId
        ? isOfficerActor
            ? `, EXISTS(
           SELECT 1
           FROM upvotes uv
           WHERE uv.report_id = r.id
             AND uv.officer_id = $${paramIdx}
         ) AS user_upvoted`
            : `, EXISTS(
           SELECT 1
           FROM upvotes uv
           WHERE uv.report_id = r.id
             AND uv.user_id = $${paramIdx}
         ) AS user_upvoted`
        : `, FALSE AS user_upvoted`;
    const dataQ = `
    SELECT
      r.id,
      r.title,
      r.description,
      r.category,
      r.media_url,
      r.media_type,
      r.photo_urls,
      r.location_lat,
      r.location_lng,
      r.address_text,
      r.upvote_count,
      r.comment_count,
      r.status,
      r.submitted_at,
      r.created_at,
      r.return_reasoning,
      r.return_instructions,
      r.escalated_to_municipality,
      r.escalated_at,
      r.pathway_type,
      r.pathway_reason,
      u.id AS reporter_id,
      u.name AS reporter_name,
      w.id AS ward_id,
      w.name AS ward_name,
      w.ward_code,
      CASE WHEN r.user_id IS NULL THEN TRUE ELSE FALSE END AS is_anonymous
      ${viewerUpvoteSelect}
    FROM reports r
    LEFT JOIN users u ON r.user_id = u.id     -- ✅ Join on user_id
    LEFT JOIN wards w ON r.ward_id = w.id
    WHERE ${whereClause}
    ORDER BY r.submitted_at DESC
    LIMIT $${paramIdx + (actorId ? 1 : 0)} OFFSET $${paramIdx + (actorId ? 2 : 1)}
  `;
    const dataValues = actorId
        ? [...values, actorId, limit, offset]
        : [...values, limit, offset];
    const { rows } = await pool.query(dataQ, dataValues);
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const pagination = {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1,
    };
    return { reports: rows, pagination };
}
// ─── Get Single Report ───────────────────────────────────────────────
export async function getReportByIdService(reportId) {
    const q = `
    SELECT
      r.*,
      u.id AS reporter_id,
      u.name AS reporter_name,
      u.email AS reporter_email,
      w.id AS ward_id,
      w.name AS ward_name,
      w.ward_code,
      wo.id AS ward_officer_id,
      wo.name AS ward_officer_name,
      assigned.id AS assigned_officer_id,
      assigned.name AS assigned_officer_name,
      kc.id AS kanban_column_id,
      kc.name AS kanban_column_name,
      kc.color AS kanban_column_color,
      CASE WHEN r.user_id IS NULL THEN TRUE ELSE FALSE END AS is_anonymous  -- ✅
    FROM reports r
    LEFT JOIN users u ON r.user_id = u.id     -- ✅ Join on user_id
    LEFT JOIN wards w ON r.ward_id = w.id
    LEFT JOIN ward_officers wo ON r.ward_officer_id = wo.id
    LEFT JOIN users assigned ON r.assigned_officer_id = assigned.id
    LEFT JOIN kanban_columns kc ON r.kanban_column_id = kc.id
    WHERE r.id = $1
  `;
    const { rows } = await pool.query(q, [reportId]);
    return rows[0] || null;
}
export async function claimReportsService(params) {
    const { userId, deviceId, reportIds } = params;
    const claimed = [];
    const errors = [];
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        for (const reportId of reportIds) {
            // 1) Verify report exists and is unclaimed
            const { rows: reportRows } = await client.query(`SELECT id, user_id FROM reports WHERE id = $1`, [reportId]);
            if (reportRows.length === 0) {
                errors.push({ reportId, reason: "Report not found" });
                continue;
            }
            if (reportRows[0].user_id !== null) {
                errors.push({ reportId, reason: "Report already claimed" });
                continue;
            }
            // 2) Verify device ownership
            const { rows: anonRows } = await client.query(`SELECT 1 FROM anonymous_reports WHERE report_id = $1 AND device_id = $2`, [reportId, deviceId]);
            if (anonRows.length === 0) {
                errors.push({ reportId, reason: "Report does not belong to this device" });
                continue;
            }
            // 3) Claim: update user_id
            await client.query(`UPDATE reports SET user_id = $1, updated_at = NOW() WHERE id = $2`, [userId, reportId]);
            // 4) Move to audit trail
            await client.query(`INSERT INTO anonymous_report_claims (report_id, device_id, claimed_by) 
         VALUES ($1, $2, $3)`, [reportId, deviceId, userId]);
            // 5) Remove from junction table
            await client.query(`DELETE FROM anonymous_reports WHERE report_id = $1`, [reportId]);
            claimed.push(reportId);
        }
        await client.query("COMMIT");
        return { claimed, errors };
    }
    catch (err) {
        await client.query("ROLLBACK");
        throw err;
    }
    finally {
        client.release();
    }
}
// ─── Get Anonymous Reports by Device ─────────────────────────────────
export async function getAnonymousReportsByDeviceService(deviceId) {
    const q = `
    SELECT
      r.id,
      r.title,
      r.description,
      r.category,
      r.media_url,
      r.media_type,
      r.photo_urls,
      r.location_lat,
      r.location_lng,
      r.address_text,
      r.status,
      r.submitted_at,
      r.created_at
    FROM reports r
    INNER JOIN anonymous_reports ar ON r.id = ar.report_id
    WHERE ar.device_id = $1 AND r.user_id IS NULL   -- ✅ Check user_id
    ORDER BY r.created_at DESC
  `;
    const { rows } = await pool.query(q, [deviceId]);
    return rows;
}
