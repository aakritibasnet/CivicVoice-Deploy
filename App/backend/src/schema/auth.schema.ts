// src/services/auth/schemas.ts
import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().min(1, "name is required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 chars"),
});

export const verifyEmailSchema = z.object({
  email: z.string().email("Invalid email"),
  code: z.string().min(4, "code is required"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "password is required"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});
