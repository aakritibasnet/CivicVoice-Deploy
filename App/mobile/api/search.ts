import { api } from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/feedback";

export type TaskSearchScope = "general" | "place";

export type TaskSearchResult = {
  id: string;
  title: string;
  description?: string;
  category: string;
  status: string;
  address_text?: string;
  created_at: string;
  ward_id?: string;
  ward_name?: string;
  ward_code?: string;
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

function extract(err: any, fallback: string) {
  return getFriendlyErrorMessage(err, fallback);
}

export async function searchPublicTasks(
  query: string,
  scope: TaskSearchScope = "general",
): Promise<TaskSearchResult[]> {
  try {
    const res = await api.get("/search/reports", {
      params: {
        q: query,
        scope,
        limit: 30,
      },
    });

    return res.data?.data?.results ?? [];
  } catch (err: any) {
    throw new Error(extract(err, "Failed to search tasks"));
  }
}

export async function searchPublicDirectory(query: string): Promise<{
  officers: DirectoryOfficerResult[];
  departments: DirectoryDepartmentResult[];
}> {
  try {
    const res = await api.get("/search/directory", {
      params: {
        q: query,
        limit: 8,
      },
    });

    return {
      officers: res.data?.data?.officers ?? [],
      departments: res.data?.data?.departments ?? [],
    };
  } catch (err: any) {
    throw new Error(extract(err, "Failed to search officers and departments"));
  }
}

export async function getPublicOfficerDetailApi(officerId: string): Promise<{
  officer: PublicOfficerDetail;
  activity: PublicOfficerActivity[];
}> {
  try {
    const res = await api.get(`/search/officers/${officerId}`);
    return res.data?.data;
  } catch (err: any) {
    throw new Error(extract(err, "Failed to load officer detail"));
  }
}
