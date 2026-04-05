import { pool } from "@/db/pool";

export type SearchScope = "general" | "place";

export type SearchParams = {
  query: string;
  scope?: SearchScope;
  category?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  bounds?: {
    neLat: number;
    neLng: number;
    swLat: number;
    swLng: number;
  } | null;
  page: number;
  limit: number;
};

export type DirectoryOfficerResult = {
  id: string;
  name: string;
  profile_image_url: string | null;
  department_id: string | null;
  department_name: string | null;
  ward_id: string | null;
  ward_name: string | null;
  ward_code: string | null;
  assigned_tasks: number;
  completed_tasks: number;
  active_tasks: number;
};

export type DirectoryDepartmentResult = {
  id: string;
  name: string;
  description: string | null;
  ward_id: string;
  ward_name: string;
  ward_code: string | null;
  officer_count: number;
};

export type PublicOfficerActivity = {
  id: number;
  report_id: string;
  old_status: string | null;
  new_status: string;
  notes: string | null;
  created_at: string;
  report_title: string;
};

export type PublicOfficerDetail = DirectoryOfficerResult & {
  role: string;
  created_at: string;
};

function reportSearchFields(scope: SearchScope) {
  const placeFields = [
    "COALESCE(r.address_text, '')",
    "COALESCE(w.name, '')",
    "COALESCE(w.ward_code, '')",
  ];

  if (scope === "place") {
    return placeFields;
  }

  return [
    "COALESCE(r.title, '')",
    "COALESCE(r.description, '')",
    "COALESCE(r.category, '')",
    ...placeFields,
  ];
}

function reportScoreExpr(scope: SearchScope, placeholder: string) {
  if (scope === "place") {
    return `
      (CASE WHEN COALESCE(r.address_text, '') ILIKE ${placeholder} THEN 4 ELSE 0 END) +
      (CASE WHEN COALESCE(w.name, '') ILIKE ${placeholder} THEN 3 ELSE 0 END) +
      (CASE WHEN COALESCE(w.ward_code, '') ILIKE ${placeholder} THEN 2 ELSE 0 END)
    `;
  }

  return `
    (CASE WHEN COALESCE(r.title, '') ILIKE ${placeholder} THEN 5 ELSE 0 END) +
    (CASE WHEN COALESCE(r.description, '') ILIKE ${placeholder} THEN 3 ELSE 0 END) +
    (CASE WHEN COALESCE(r.category, '') ILIKE ${placeholder} THEN 2 ELSE 0 END) +
    (CASE WHEN COALESCE(r.address_text, '') ILIKE ${placeholder} THEN 1 ELSE 0 END) +
    (CASE WHEN COALESCE(w.name, '') ILIKE ${placeholder} THEN 1 ELSE 0 END)
  `;
}

export async function searchReports(params: SearchParams) {
  const {
    query,
    scope = "general",
    category,
    status,
    startDate,
    endDate,
    bounds,
    page,
    limit,
  } = params;

  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return {
      results: [],
      pagination: {
        currentPage: page,
        totalPages: 0,
        totalCount: 0,
        hasNext: false,
        hasPrev: false,
      },
    };
  }

  const terms = trimmed.split(/\s+/).map((term) => term.trim()).filter(Boolean);
  const whereClauses: string[] = ["r.is_public = TRUE"];
  const values: Array<string | number> = [];
  let idx = 1;

  const searchableFields = reportSearchFields(scope);

  for (const term of terms) {
    const like = `%${term}%`;
    whereClauses.push(
      `(${searchableFields.map((field) => `${field} ILIKE $${idx}`).join(" OR ")})`,
    );
    values.push(like);
    idx += 1;
  }

  if (category) {
    whereClauses.push(`r.category = $${idx}`);
    values.push(category);
    idx += 1;
  }

  if (status) {
    whereClauses.push(`r.status = $${idx}`);
    values.push(status);
    idx += 1;
  }

  if (startDate) {
    whereClauses.push(`r.created_at >= $${idx}::date`);
    values.push(startDate);
    idx += 1;
  }

  if (endDate) {
    whereClauses.push(`r.created_at < ($${idx}::date + INTERVAL '1 day')`);
    values.push(endDate);
    idx += 1;
  }

  if (bounds) {
    whereClauses.push(
      `r.location_lat BETWEEN $${idx} AND $${idx + 1} AND r.location_lng BETWEEN $${idx + 2} AND $${idx + 3}`,
    );
    values.push(bounds.swLat, bounds.neLat, bounds.swLng, bounds.neLng);
    idx += 4;
  }

  const where = whereClauses.join(" AND ");
  const fromClause = `
    FROM reports r
    LEFT JOIN wards w ON r.ward_id = w.id
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    ${fromClause}
    WHERE ${where}
  `;
  const countRes = await pool.query<{ total: number }>(countSql, values);
  const totalCount = countRes.rows[0]?.total ?? 0;

  const likeAll = `%${trimmed}%`;
  const scorePlaceholder = `$${idx}`;
  const scoreExpr = reportScoreExpr(scope, scorePlaceholder);
  const dataValues = [...values, likeAll];
  const limitPlaceholder = `$${idx + 1}`;
  const offsetPlaceholder = `$${idx + 2}`;
  const offset = (page - 1) * limit;

  dataValues.push(limit, offset);

  const dataSql = `
    SELECT
      r.id,
      r.title,
      r.description,
      r.category,
      r.status,
      r.media_url,
      r.media_type,
      r.address_text,
      r.location_lat,
      r.location_lng,
      r.upvote_count,
      r.comment_count,
      r.created_at,
      w.id AS ward_id,
      w.name AS ward_name,
      w.ward_code,
      ${scoreExpr} AS relevance
    ${fromClause}
    WHERE ${where}
    ORDER BY relevance DESC, r.created_at DESC
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
  `;

  const { rows } = await pool.query(dataSql, dataValues);
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / limit) : 0;

  return {
    results: rows,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export async function searchDirectory(query: string, limit: number) {
  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;
  const like = `%${trimmed}%`;

  const officerValues: Array<string | number> = [];
  const officerWhere = [
    `u.role = 'officer'`,
    `u.is_active = TRUE`,
    `u.deleted_at IS NULL`,
  ];

  if (hasQuery) {
    officerValues.push(like);
    officerWhere.push(
      `(u.name ILIKE $1 OR COALESCE(d.name, '') ILIKE $1 OR COALESCE(w.name, '') ILIKE $1 OR COALESCE(w.ward_code, '') ILIKE $1)`,
    );
  }

  officerValues.push(limit);
  const officerLimitPlaceholder = `$${officerValues.length}`;

  const officersSql = `
    SELECT
      u.id,
      u.name,
      u.profile_image_url,
      od.department_id,
      d.name AS department_name,
      w.id AS ward_id,
      w.name AS ward_name,
      w.ward_code,
      COALESCE((SELECT COUNT(*)::int FROM reports r WHERE r.assigned_to = u.id), 0) AS assigned_tasks,
      COALESCE((SELECT COUNT(*)::int FROM reports r WHERE r.assigned_to = u.id AND r.status = 'resolved'), 0) AS completed_tasks,
      COALESCE((SELECT COUNT(*)::int FROM reports r WHERE r.assigned_to = u.id AND r.status IN ('submitted', 'under_review', 'in_progress')), 0) AS active_tasks
    FROM users u
    LEFT JOIN officer_departments od ON od.officer_id = u.id
    LEFT JOIN departments d ON d.id = od.department_id
    LEFT JOIN wards w ON w.id = u.ward_id
    WHERE ${officerWhere.join(" AND ")}
    ORDER BY completed_tasks DESC, active_tasks DESC, u.name ASC
    LIMIT ${officerLimitPlaceholder}
  `;

  const departmentsValues: Array<string | number> = [];
  const departmentWhere: string[] = [];

  if (hasQuery) {
    departmentsValues.push(like);
    departmentWhere.push(
      `(d.name ILIKE $1 OR COALESCE(d.description, '') ILIKE $1 OR COALESCE(w.name, '') ILIKE $1 OR COALESCE(w.ward_code, '') ILIKE $1)`,
    );
  }

  departmentsValues.push(limit);
  const departmentsLimitPlaceholder = `$${departmentsValues.length}`;
  const departmentsWhereClause =
    departmentWhere.length > 0 ? `WHERE ${departmentWhere.join(" AND ")}` : "";

  const departmentsSql = `
    SELECT
      d.id,
      d.name,
      d.description,
      w.id AS ward_id,
      w.name AS ward_name,
      w.ward_code,
      COUNT(od.officer_id)::int AS officer_count
    FROM departments d
    JOIN wards w ON w.id = d.ward_id
    LEFT JOIN officer_departments od ON od.department_id = d.id
    ${departmentsWhereClause}
    GROUP BY d.id, w.id
    ORDER BY officer_count DESC, d.name ASC
    LIMIT ${departmentsLimitPlaceholder}
  `;

  const [officersRes, departmentsRes] = await Promise.all([
    pool.query<DirectoryOfficerResult>(officersSql, officerValues),
    pool.query<DirectoryDepartmentResult>(departmentsSql, departmentsValues),
  ]);

  return {
    officers: officersRes.rows,
    departments: departmentsRes.rows,
  };
}

export async function getPublicOfficerDetail(officerId: string): Promise<{
  officer: PublicOfficerDetail | null;
  activity: PublicOfficerActivity[];
}> {
  const officerRes = await pool.query<PublicOfficerDetail>(
    `
      SELECT
        u.id,
        u.name,
        u.role,
        u.profile_image_url,
        u.created_at,
        od.department_id,
        d.name AS department_name,
        w.id AS ward_id,
        w.name AS ward_name,
        w.ward_code,
        COALESCE((SELECT COUNT(*)::int FROM reports r WHERE r.assigned_to = u.id), 0) AS assigned_tasks,
        COALESCE((SELECT COUNT(*)::int FROM reports r WHERE r.assigned_to = u.id AND r.status = 'resolved'), 0) AS completed_tasks,
        COALESCE((SELECT COUNT(*)::int FROM reports r WHERE r.assigned_to = u.id AND r.status IN ('submitted', 'under_review', 'in_progress')), 0) AS active_tasks
      FROM users u
      LEFT JOIN officer_departments od ON od.officer_id = u.id
      LEFT JOIN departments d ON d.id = od.department_id
      LEFT JOIN wards w ON w.id = u.ward_id
      WHERE u.id = $1
        AND u.role = 'officer'
        AND u.is_active = TRUE
        AND u.deleted_at IS NULL
      LIMIT 1
    `,
    [officerId],
  );

  const officer = officerRes.rows[0] ?? null;
  if (!officer) {
    return { officer: null, activity: [] };
  }

  const activityRes = await pool.query<PublicOfficerActivity>(
    `
      SELECT
        sh.id,
        sh.report_id,
        sh.old_status,
        sh.new_status,
        sh.notes,
        sh.created_at,
        r.title AS report_title
      FROM status_history sh
      JOIN reports r ON r.id = sh.report_id
      WHERE sh.changed_by = $1
      ORDER BY sh.created_at DESC
      LIMIT 10
    `,
    [officerId],
  );

  return {
    officer,
    activity: activityRes.rows,
  };
}
