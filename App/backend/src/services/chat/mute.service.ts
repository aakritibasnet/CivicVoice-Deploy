// Per-chat mute / snooze. Durations: 15m, 1h, tomorrow, forever, off.
// Snooze is just a future muted_until; "forever" is timestamptz 'infinity'
// so expiry checks (muted_until > now) stay a single comparison.

import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";
import type { ResolvedPrincipal } from "./principal";
import { assertChatAccess } from "./access";

export type MuteDuration = "15m" | "1h" | "tomorrow" | "forever" | "off";

function mutedUntilSql(d: MuteDuration): { expr: string; label: string } {
  switch (d) {
    case "15m":
      return { expr: "CURRENT_TIMESTAMP + interval '15 minutes'", label: d };
    case "1h":
      return { expr: "CURRENT_TIMESTAMP + interval '1 hour'", label: d };
    case "tomorrow":
      // Start of the next day (server TZ); "muted until tomorrow".
      return {
        expr: "date_trunc('day', CURRENT_TIMESTAMP) + interval '1 day'",
        label: d,
      };
    case "forever":
      return { expr: "'infinity'::timestamptz", label: d };
    case "off":
      return { expr: "NULL", label: d };
  }
}

export async function setMute(
  principal: ResolvedPrincipal,
  chatId: string,
  duration: MuteDuration,
): Promise<{ mutedUntil: string | null }> {
  const valid: MuteDuration[] = ["15m", "1h", "tomorrow", "forever", "off"];
  if (!valid.includes(duration)) {
    throw new AppError("Invalid mute duration", 400);
  }
  // read access materializes a participant row if type-derived.
  await assertChatAccess(principal, chatId, "read");

  const { expr } = mutedUntilSql(duration);
  const { rows } = await pool.query(
    `UPDATE chat_participants
        SET muted_until = ${expr}
      WHERE chat_id = $1 AND party_kind = $2 AND party_id = $3
    RETURNING muted_until`,
    [chatId, principal.kind, principal.id],
  );
  if (!rows[0]) throw new AppError("Not a participant", 403);
  return { mutedUntil: rows[0].muted_until ?? null };
}
