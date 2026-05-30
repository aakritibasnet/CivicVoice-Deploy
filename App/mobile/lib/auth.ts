import { api } from "./api";
import { clearTokens, getRefreshToken, saveTokens, Tokens } from "./session";
import { debugWarn } from "./debug";

export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at?: string;
  profile_image_url?: string | null;
  ward_id?: number | null;
  ward_name?: string | null;
  is_ward_account?: boolean;
  type?: "ward_officer" | "municipality_officer";
  must_change_password?: boolean;
  department_id?: string | null;
  department_name?: string | null;
  municipality_id?: string | number | null;
  municipality_name?: string | null;
};

export function isOfficer(user: User | null): boolean {
  return !!user && user.role === "officer";
}

export function isWardUser(user: User | null): boolean {
  return (
    !!user &&
    !!user.ward_id &&
    ["officer", "supervisor", "administrator"].includes(user.role)
  );
}

export function isWardOrgAccount(user: User | null): boolean {
  return !!user && !!user.is_ward_account;
}

export type SignupPayload = {
  name: string;
  email: string;
  password: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type VerifyPayload = {
  email: string;
  code: string;
};

export type AuthResponse = {
  message: string;
  user: User;
} & Tokens;

export async function signup(
  payload: SignupPayload,
): Promise<{ message: string }> {
  const res = await api.post("/auth/signup", payload);
  return res.data;
}

export async function verifyEmail(
  payload: VerifyPayload,
): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>("/auth/verify-email", payload);

  await saveTokens({
    accessToken: res.data.accessToken,
    refreshToken: res.data.refreshToken,
  });

  return res.data;
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>("/auth/login", payload);

  await saveTokens({
    accessToken: res.data.accessToken,
    refreshToken: res.data.refreshToken,
  });

  return res.data;
}

export async function getMe(): Promise<{ user: User }> {
  const res = await api.get<{ user: User }>("/auth/me");
  return res.data;
}

export async function logout(): Promise<void> {
  const refreshToken = await getRefreshToken();

  if (refreshToken) {
    try {
      await api.post("/auth/logout", { refreshToken });
    } catch (error) {
      debugWarn("Logout request failed, clearing tokens anyway", error);
    }
  }

  await clearTokens();
}
