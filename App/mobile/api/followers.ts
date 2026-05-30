import { api } from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/feedback";

export async function toggleFollow(
  reportId: string,
): Promise<{ following: boolean }> {
  try {
    const res = await api.post(`/reports/${reportId}/follow`, {});
    return res.data?.data ?? res.data;
  } catch (err: any) {
    throw new Error(getFriendlyErrorMessage(err, "Failed to toggle follow"));
  }
}
