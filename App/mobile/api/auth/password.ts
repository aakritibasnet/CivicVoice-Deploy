import { api } from "@/lib/api";

export async function forgotPassword(payload: { email: string }) {
  const res = await api.post("/auth/forgot-password", payload);
  return res.data as { message: string; exists: boolean };
}

export async function resetPassword(payload: {
  email: string;
  code: string;
  new_password: string;
}) {
  const res = await api.post("/auth/reset-password", payload);
  return res.data as { message: string };
}
