import bcrypt from "bcrypt";
import { z } from "zod";
import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";
import { normalizeEmail } from "@/lib/normalize";
import {
  sendVerificationCode,
  verifyLatestCode,
} from "@/services/auth/verification.service";
import {
  uploadBufferToCloudinary,
  deleteFromCloudinary,
} from "@/lib/upload.cloudinary";

/** Inputs */
const editNameSchema = z.object({
  name: z.string().min(1, "name is required"),
});

const requestEmailChangeSchema = z.object({
  new_email: z.string().email("Invalid email"),
});

const confirmEmailChangeSchema = z.object({
  new_email: z.string().email("Invalid email"),
  code: z.string().min(4, "code is required"),
});


function mustUserId(jwtUser: Express.UserPayload | undefined) {
  const userId = jwtUser?.id;
  if (!userId) throw new AppError("Unauthorized", 401);
  return userId;
}

async function blockIfWardAccount(userId: string) {
  const res = await pool.query<{
    role: string;
    deleted_at: Date | null;
  }>(
    `SELECT role, deleted_at FROM users WHERE id = $1`,
    [userId],
  );

  if (res.rows.length === 0 || res.rows[0].deleted_at) {
    throw new AppError("User not found", 404);
  }

  if (["ward", "municipality", "admin"].includes(res.rows[0].role)) {
    throw new AppError("Ward organizational accounts cannot be edited from the app.", 403);
  }
}

/** Edit full name */
export async function editFullNameService(
  jwtUser: Express.UserPayload | undefined,
  body: unknown,
) {
  const userId = mustUserId(jwtUser);
  await blockIfWardAccount(userId);

  const parsed = editNameSchema.safeParse(body);
  if (!parsed.success)
    throw new AppError(parsed.error.issues[0]?.message || "Invalid input", 400);

  const name = parsed.data.name.trim();

  await pool.query(`UPDATE users SET name = $1 WHERE id = $2`, [name, userId]);

  return { message: "Full name updated." };
}

/** Update profile image (file upload → Cloudinary) */
export async function updateProfileImageService(
  jwtUser: Express.UserPayload | undefined,
  file: Express.Multer.File | undefined,
) {
  const userId = mustUserId(jwtUser);

  if (!file) throw new AppError("Image file is required", 400);

  // Delete old image from Cloudinary if one exists
  const existing = await pool.query(
    `SELECT profile_image_public_id FROM users WHERE id = $1`,
    [userId],
  );
  const oldPublicId = existing.rows[0]?.profile_image_public_id;
  if (oldPublicId) {
    try {
      await deleteFromCloudinary(oldPublicId);
    } catch {
      // ignore – old image may already be gone
    }
  }

  // Upload new image
  const result = await uploadBufferToCloudinary({
    buffer: file.buffer,
    folder: "profile_images",
    resourceType: "image",
  });

  await pool.query(
    `UPDATE users SET profile_image_url = $1, profile_image_public_id = $2 WHERE id = $3`,
    [result.secure_url, result.public_id, userId],
  );

  return { message: "Profile image updated.", profile_image_url: result.secure_url };
}

/**
 * Step 1: Request email change
 * - send code to NEW email
 */
export async function requestEmailChangeService(
  jwtUser: Express.UserPayload | undefined,
  body: unknown,
) {
  const userId = mustUserId(jwtUser);

  const parsed = requestEmailChangeSchema.safeParse(body);
  if (!parsed.success)
    throw new AppError(parsed.error.issues[0]?.message || "Invalid input", 400);

  const newEmail = normalizeEmail(parsed.data.new_email);

  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [
    newEmail,
  ]);
  if (existing.rows.length > 0)
    throw new AppError("Email already in use.", 409);

  const pending = await pool.query(
    `SELECT id FROM pending_users WHERE email = $1`,
    [newEmail],
  );
  if (pending.rows.length > 0)
    throw new AppError("Email already pending verification.", 409);

  const currentUser = await pool.query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  if (currentUser.rows.length === 0) {
    throw new AppError("User not found.", 404);
  }

  await sendVerificationCode({
    email: normalizeEmail(currentUser.rows[0].email),
    target: newEmail,
    purpose: "EMAIL_CHANGE",
    meta: { id: userId, new_email: newEmail },
  });

  return { message: "Verification code sent to new email." };
}

/**
 * Step 2: Confirm email change
 */
export async function confirmEmailChangeService(
  jwtUser: Express.UserPayload | undefined,
  body: unknown,
) {
  const userId = mustUserId(jwtUser);

  const parsed = confirmEmailChangeSchema.safeParse(body);
  if (!parsed.success)
    throw new AppError(parsed.error.issues[0]?.message || "Invalid input", 400);

  const newEmail = normalizeEmail(parsed.data.new_email);

  const verified = await verifyLatestCode({
    purpose: "EMAIL_CHANGE",
    lookupEmail: newEmail,
    code: parsed.data.code,
  });

  const verifiedMeta =
    verified.meta && typeof verified.meta === "object" && !Array.isArray(verified.meta)
      ? (verified.meta as { id?: string; new_email?: string })
      : {};

  const metaUserId = String(verifiedMeta.id || "");
  const metaEmail = String(verifiedMeta.new_email || "");
  if (metaUserId !== userId || metaEmail !== newEmail) {
    throw new AppError(
      "Verification mismatch. Please request a new code.",
      400,
    );
  }

  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [
    newEmail,
  ]);
  if (existing.rows.length > 0)
    throw new AppError("Email already in use.", 409);

  await pool.query(`UPDATE users SET email = $1 WHERE id = $2`, [
    newEmail,
    userId,
  ]);

  return { message: "Email updated successfully." };
}

/**
 * Public profile: name, profile image, badges, streaks.
 * No email or bookmarks (sensitive).
 */
export async function getPublicProfileService(userId: string) {
  const userRes = await pool.query(
    `SELECT id, name, profile_image_url, created_at
     FROM users
     WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  if (userRes.rows.length === 0) return null;
  const user = userRes.rows[0];

  // Stats
  let stats = {
    total_reports: 0,
    resolved_reports: 0,
    current_streak_days: 0,
    longest_streak_days: 0,
    impact_score: 0,
  };
  try {
    const statsRes = await pool.query(
      `SELECT total_reports, resolved_reports, current_streak_days, longest_streak_days, impact_score
       FROM user_stats WHERE user_id = $1`,
      [userId],
    );
    if (statsRes.rows.length > 0) stats = statsRes.rows[0];
  } catch {}

  // Badges
  let badges: any[] = [];
  try {
    const badgesRes = await pool.query(
      `SELECT b.id, b.name, b.description, b.icon_name, b.tier, ub.earned_at
       FROM user_badges ub
       JOIN badges b ON b.id = ub.badge_id
       WHERE ub.user_id = $1
       ORDER BY ub.earned_at DESC`,
      [userId],
    );
    badges = badgesRes.rows;
  } catch {}

  return {
    id: user.id,
    name: user.name,
    profile_image_url: user.profile_image_url,
    member_since: user.created_at,
    stats,
    badges,
  };
}

/** Change password (authenticated) */
const changePasswordSchema = z.object({
  current_password: z.string().min(1, "Current password is required"),
  new_password: z.string().min(6, "New password must be at least 6 characters"),
});

export async function changePasswordService(
  jwtUser: Express.UserPayload | undefined,
  body: unknown,
) {
  const userId = mustUserId(jwtUser);
  await blockIfWardAccount(userId);

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success)
    throw new AppError(parsed.error.issues[0]?.message || "Invalid input", 400);

  const { current_password, new_password } = parsed.data;

  // Fetch current password hash
  const userRes = await pool.query(
    `SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  if (userRes.rows.length === 0) throw new AppError("User not found", 404);

  const { password_hash } = userRes.rows[0];
  if (!password_hash) {
    throw new AppError("This account has no password set.", 400);
  }

  const isMatch = await bcrypt.compare(current_password, password_hash);
  if (!isMatch) throw new AppError("Current password is incorrect.", 401);

  const newHash = await bcrypt.hash(new_password, 12);
  await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
    newHash,
    userId,
  ]);

  return { message: "Password changed successfully." };
}
