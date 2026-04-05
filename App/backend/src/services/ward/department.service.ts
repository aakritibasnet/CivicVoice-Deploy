// src/services/ward/department.service.ts
import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";

export type Department = {
  id: string;
  ward_id: string;
  name: string;
  description: string | null;
  officer_count?: number;
  created_at: string;
};

export type OfficerWithDepartment = {
  id: string;
  name: string;
  email: string;
  role: string;
  profile_image_url: string | null;
  department_id: string | null;
  department_name: string | null;
  assigned_tasks: number;
  completed_tasks: number;
  active_tasks: number;
  created_at: string;
};

/** List all departments for a ward, with officer count */
export async function listDepartments(wardId: string): Promise<Department[]> {
  const { rows } = await pool.query(
    `SELECT d.id, d.ward_id, d.name, d.description, d.created_at,
            COUNT(od.officer_id)::int AS officer_count
     FROM departments d
     LEFT JOIN officer_departments od ON od.department_id = d.id
     WHERE d.ward_id = $1
     GROUP BY d.id
     ORDER BY d.name ASC`,
    [wardId],
  );
  return rows;
}

/** Create a new department under a ward */
export async function createDepartment(
  wardId: string,
  name: string,
  description?: string,
): Promise<Department> {
  const { rows } = await pool.query(
    `INSERT INTO departments (ward_id, name, description)
     VALUES ($1, $2, $3)
     RETURNING id, ward_id, name, description, created_at`,
    [wardId, name.trim(), description?.trim() || null],
  );
  return rows[0];
}

/** List officers for a ward, optionally filtered by department */
export async function listOfficers(
  wardId: string,
  departmentId?: string,
): Promise<OfficerWithDepartment[]> {
  let query = `
    SELECT u.id, u.name, u.email, u.role, u.profile_image_url, u.created_at,
           od.department_id,
           d.name AS department_name,
           COALESCE(
             (SELECT COUNT(*)::int FROM reports r WHERE r.assigned_to = u.id), 0
           ) AS assigned_tasks,
           COALESCE(
             (SELECT COUNT(*)::int FROM reports r WHERE r.assigned_to = u.id AND r.status = 'resolved'), 0
           ) AS completed_tasks,
           COALESCE(
             (SELECT COUNT(*)::int FROM reports r WHERE r.assigned_to = u.id AND r.status IN ('submitted', 'under_review', 'in_progress')), 0
           ) AS active_tasks
    FROM users u
    LEFT JOIN officer_departments od ON od.officer_id = u.id
    LEFT JOIN departments d ON d.id = od.department_id
    WHERE u.ward_id = $1
      AND u.role = 'officer'
      AND u.is_active = true
      AND u.deleted_at IS NULL
  `;

  const values: any[] = [wardId];

  if (departmentId) {
    query += ` AND od.department_id = $2`;
    values.push(departmentId);
  }

  query += ` ORDER BY u.name ASC`;

  const { rows } = await pool.query(query, values);
  return rows;
}

/** Get a single officer's full profile */
export async function getOfficerDetail(
  officerId: string,
  wardId: string,
): Promise<OfficerWithDepartment | null> {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.profile_image_url, u.created_at,
            od.department_id,
            d.name AS department_name,
            COALESCE(
              (SELECT COUNT(*)::int FROM reports r WHERE r.assigned_to = u.id), 0
            ) AS assigned_tasks,
            COALESCE(
              (SELECT COUNT(*)::int FROM reports r WHERE r.assigned_to = u.id AND r.status = 'resolved'), 0
            ) AS completed_tasks,
            COALESCE(
              (SELECT COUNT(*)::int FROM reports r WHERE r.assigned_to = u.id AND r.status IN ('submitted', 'under_review', 'in_progress')), 0
            ) AS active_tasks
     FROM users u
     LEFT JOIN officer_departments od ON od.officer_id = u.id
     LEFT JOIN departments d ON d.id = od.department_id
     WHERE u.id = $1
       AND u.ward_id = $2
       AND u.role = 'officer'
       AND u.is_active = true
       AND u.deleted_at IS NULL`,
    [officerId, wardId],
  );
  return rows[0] || null;
}

/** Assign an officer to a department */
export async function assignOfficerToDepartment(
  officerId: string,
  departmentId: string,
  wardId: string,
): Promise<void> {
  // Verify officer belongs to this ward
  const officerRes = await pool.query(
    `SELECT id FROM users WHERE id = $1 AND ward_id = $2 AND role = 'officer'`,
    [officerId, wardId],
  );
  if (officerRes.rows.length === 0) {
    throw new AppError("Officer not found in this ward", 404);
  }

  // Verify department belongs to this ward
  const deptRes = await pool.query(
    `SELECT id FROM departments WHERE id = $1 AND ward_id = $2`,
    [departmentId, wardId],
  );
  if (deptRes.rows.length === 0) {
    throw new AppError("Department not found in this ward", 404);
  }

  await pool.query(
    `INSERT INTO officer_departments (officer_id, department_id)
     VALUES ($1, $2)
     ON CONFLICT (officer_id)
     DO UPDATE SET department_id = EXCLUDED.department_id, assigned_at = NOW()`,
    [officerId, departmentId],
  );
}

/** Get recent activity for an officer (last status changes they made) */
export async function getOfficerActivity(
  officerId: string,
  limit: number = 10,
) {
  const { rows } = await pool.query(
    `SELECT sh.id, sh.report_id, sh.old_status, sh.new_status, sh.notes, sh.created_at,
            r.title AS report_title
     FROM status_history sh
     JOIN reports r ON r.report_id = sh.report_id
     WHERE sh.changed_by = $1
     ORDER BY sh.created_at DESC
     LIMIT $2`,
    [officerId, limit],
  );
  return rows;
}
