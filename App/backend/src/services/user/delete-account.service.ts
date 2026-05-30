import { z } from "zod";
import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";

const deleteAccountSchema = z.object({
  confirm: z.string().min(1, "confirm is required"),
});

function mustUserId(jwtUser: Express.UserPayload | undefined) {
  const userId = jwtUser?.id;
  if (!userId) throw new AppError("Unauthorized", 401);
  return userId;
}

export async function deleteAccountService(
  jwtUser: Express.UserPayload | undefined,
  body: unknown,
) {
  const userId = mustUserId(jwtUser);

  // Ward organizational accounts cannot be deleted via API
  const wardCheck = await pool.query<{
    role: string;
    deleted_at: Date | null;
  }>(
    `SELECT role, deleted_at FROM users WHERE id = $1`,
    [userId],
  );
  if (wardCheck.rows.length === 0 || wardCheck.rows[0].deleted_at) {
    throw new AppError("User not found", 404);
  }

  if (["ward", "municipality", "admin"].includes(wardCheck.rows[0].role)) {
    throw new AppError(
      "Ward organizational accounts cannot be deleted from the app. Contact database administrator.",
      403,
    );
  }

  const parsed = deleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || "Invalid input", 400);
  }

  const confirm = parsed.data.confirm.trim().toUpperCase();
  if (confirm !== "CONFIRM") {
    throw new AppError('Type "CONFIRM" to delete your account.', 400);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // already deleted?
    const check = await client.query(
      `SELECT id, deleted_at FROM users WHERE id = $1`,
      [userId],
    );
    if (check.rows.length === 0) throw new AppError("User not found", 404);
    if (check.rows[0].deleted_at) {
      // idempotent
      await client.query("COMMIT");
      return { message: "Account already deleted." };
    }

    // soft delete
    await client.query(`UPDATE users SET deleted_at = NOW() WHERE id = $1`, [
      userId,
    ]);

    // revoke all refresh tokens
    await client.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );

    await client.query("COMMIT");
    return { message: "Account deleted successfully." };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
