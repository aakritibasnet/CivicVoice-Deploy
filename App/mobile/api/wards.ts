import { api } from "@/lib/api";

export type Ward = {
  id: string;
  ward_name: string;
  ward_code: string;
  municipality_id?: string | null;
};

export async function getWardsList(): Promise<Ward[]> {
  const res = await api.get<{ wards: Ward[] }>("/wards");
  return res.data.wards;
}

export async function getCategoriesList(): Promise<string[]> {
  const res = await api.get<{ categories: string[] }>("/wards/categories");
  return res.data.categories;
}
