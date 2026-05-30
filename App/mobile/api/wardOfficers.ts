// api/wardOfficers.ts
import { api } from "@/lib/api";

export type Department = {
  id: string;
  ward_id: number;
  name: string;
  description: string | null;
  officer_count: number;
  created_at: string;
};

export type Officer = {
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

export type OfficerActivity = {
  id: number;
  report_id: number;
  old_status: string | null;
  new_status: string;
  notes: string | null;
  created_at: string;
  report_title: string;
};

export async function listDepartments(): Promise<Department[]> {
  const res = await api.get("/wards/departments");
  return res.data?.departments ?? [];
}

export async function createDepartment(name: string, description?: string): Promise<Department> {
  const res = await api.post("/wards/departments", { name, description });
  return res.data?.department;
}

export async function listOfficers(departmentId?: string): Promise<Officer[]> {
  const params: Record<string, string> = {};
  if (departmentId) params.department_id = departmentId;
  const res = await api.get("/wards/officers", { params });
  return res.data?.officers ?? [];
}

export async function getOfficerDetail(officerId: string): Promise<{
  officer: Officer;
  activity: OfficerActivity[];
}> {
  const res = await api.get(`/wards/officers/${officerId}`);
  return { officer: res.data?.officer, activity: res.data?.activity ?? [] };
}

export async function assignOfficerToDepartment(
  officerId: string,
  departmentId: string,
): Promise<void> {
  await api.post("/wards/officers/assign", {
    officer_id: officerId,
    department_id: departmentId,
  });
}
