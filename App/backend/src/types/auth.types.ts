// src/types/auth.types.ts
import type { Role } from "@/lib/tokens";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
};

export type PublicUserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: Date;
  last_login_at?: Date | null;
  profile_image_url?: string | null;
};

export type PendingUserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: Date;
  updated_at: Date;
};

export type OtpRow = {
  id: string;
  email: string;
  target: string;
  purpose: string;
  code_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
};

export type RefreshTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
  revoked_at: Date | null;
};

// ✅ Removed declare global - we'll put it in one place
