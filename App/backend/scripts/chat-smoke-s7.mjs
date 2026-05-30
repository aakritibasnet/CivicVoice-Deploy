// Sprint 7 DoD smoke: mute durations + expiry, emergency bypass, mention
// notifies a muted user, preference matrix for officers AND users.
//   CHAT_PUSH_DEBOUNCE_MS=300 PORT=5055 node --import tsx src/server.ts
//   PORT=5055 node scripts/chat-smoke-s7.mjs
import "dotenv/config";
import jwt from "jsonwebtoken";
import pg from "pg";

const PORT = process.env.PORT || 5055;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = process.env.JWT_ACCESS_SECRET;

const WARD_A = "2b4296db-bec1-4c56-b0e7-57a2b6ce7844";
const SUBASH = "0958fbc0-4264-48ff-9c5d-e3b4218416f6";
const RITA = "6519cd75-394e-477b-8370-15d993645759";
const USER_WARD = "72b90ae5-c4ce-42fd-8d1d-ea263e478335"; // users row, role ward

const tokOfficer = (id) =>
  jwt.sign(
    { id, email: `${id}@t.local`, role: "officer", kind: "officer", ward_id: WARD_A },
    SECRET,
    { expiresIn: "10m" },
  );
const tokUser = (id) =>
  jwt.sign(
    { id, email: `${id}@t.local`, role: "ward", kind: "user" },
    SECRET,
    { expiresIn: "10m" },
  );

const api = async (path, opts, token) => {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(opts?.headers || {}),
    },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const assert = (c, m) => {
  if (!c) throw new Error("FAIL: " + m);
  console.log("  ok:", m);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });

const clearNotifs = () =>
  db.query(
    "DELETE FROM notifications WHERE officer_id=$1 AND type IN ('chat_message','chat_mention')",
    [RITA],
  );
const count = async (type) =>
  (
    await db.query(
      "SELECT count(*)::int n FROM notifications WHERE officer_id=$1 AND type=$2",
      [RITA, type],
    )
  ).rows[0].n;
const muteInfo = async (chatId) =>
  (
    await db.query(
      `SELECT EXTRACT(EPOCH FROM (muted_until - now())) AS secs,
              muted_until = 'infinity'::timestamptz AS inf,
              muted_until IS NULL AS isnull
         FROM chat_participants
        WHERE chat_id=$1 AND party_kind='officer' AND party_id=$2`,
      [chatId, RITA],
    )
  ).rows[0];
const mute = (chatId, duration) =>
  api(
    `/api/chat/${chatId}/mute`,
    { method: "POST", body: JSON.stringify({ duration }) },
    tokOfficer(RITA),
  );
const sendMsg = (chatId, extra) =>
  api(
    `/api/chat/${chatId}/messages`,
    { method: "POST", body: JSON.stringify({ body: "hi", ...extra }) },
    tokOfficer(SUBASH),
  );

const main = async () => {
  await db.connect();
  const chatId = (
    await api(
      "/api/chat",
      { method: "POST", body: JSON.stringify({ type: "officer_ward", wardId: WARD_A }) },
      tokOfficer(SUBASH),
    )
  ).body.data.chat.id;
  assert(!!chatId, "officer_ward chat created");
  // materialize Rita's participant row
  await mute(chatId, "off");

  // 1) Mute durations compute correctly
  await mute(chatId, "15m");
  let mi = await muteInfo(chatId);
  assert(mi.secs > 14 * 60 && mi.secs < 16 * 60, "15m mute ≈ +15min");
  await mute(chatId, "1h");
  mi = await muteInfo(chatId);
  assert(mi.secs > 59 * 60 && mi.secs < 61 * 60, "1h mute ≈ +1h");
  await mute(chatId, "tomorrow");
  mi = await muteInfo(chatId);
  assert(mi.secs > 0 && mi.secs < 48 * 3600, "tomorrow mute is a future day");
  await mute(chatId, "forever");
  mi = await muteInfo(chatId);
  assert(mi.inf === true, "forever mute = infinity");
  await mute(chatId, "off");
  mi = await muteInfo(chatId);
  assert(mi.isnull === true, "off clears mute");

  // 2) Expired mute does NOT suppress (proves expiry semantics)
  await db.query(
    `UPDATE chat_participants SET muted_until = now() - interval '1 minute'
      WHERE chat_id=$1 AND party_kind='officer' AND party_id=$2`,
    [chatId, RITA],
  );
  await clearNotifs();
  await sendMsg(chatId);
  await sleep(700);
  assert((await count("chat_message")) === 1, "expired mute → push delivered");

  // 3) Active mute suppresses a normal message
  await mute(chatId, "forever");
  await clearNotifs();
  await sendMsg(chatId);
  await sleep(700);
  assert((await count("chat_message")) === 0, "active mute suppresses push");

  // 4) Emergency bypasses mute (policy chat.urgent_bypasses_mute=true)
  await clearNotifs();
  await sendMsg(chatId, { priority: "emergency" });
  await sleep(700);
  assert(
    (await count("chat_message")) === 1,
    "emergency message bypasses mute",
  );

  // 5) Mention notifies a muted user
  await clearNotifs();
  await sendMsg(chatId, { mentions: [{ kind: "officer", id: RITA }] });
  await sleep(400);
  assert(
    (await count("chat_mention")) === 1 && (await count("chat_message")) === 0,
    "mention notifies muted user (chat_mention, not coalesced)",
  );

  // 6) Officer preference matrix
  await mute(chatId, "off");
  await api(
    "/api/chat/notification-prefs",
    { method: "PUT", body: JSON.stringify({ push_enabled: false }) },
    tokOfficer(RITA),
  );
  const prefGet = await api(
    "/api/chat/notification-prefs",
    {},
    tokOfficer(RITA),
  );
  assert(
    prefGet.body.data.prefs.push_enabled === false,
    "officer prefs persisted (push_enabled=false)",
  );
  await clearNotifs();
  await sendMsg(chatId);
  await sleep(700);
  assert(
    (await count("chat_message")) === 0,
    "push_enabled=false suppresses (officer)",
  );

  const hr = new Date().getHours();
  await api(
    "/api/chat/notification-prefs",
    {
      method: "PUT",
      body: JSON.stringify({
        push_enabled: true,
        dnd: false,
        quiet_hours_start: hr,
        quiet_hours_end: (hr + 1) % 24,
      }),
    },
    tokOfficer(RITA),
  );
  await clearNotifs();
  await sendMsg(chatId);
  await sleep(700);
  assert(
    (await count("chat_message")) === 0,
    "quiet hours suppress (officer)",
  );

  await api(
    "/api/chat/notification-prefs",
    {
      method: "PUT",
      body: JSON.stringify({ quiet_hours_start: null, quiet_hours_end: null }),
    },
    tokOfficer(RITA),
  );
  await clearNotifs();
  await sendMsg(chatId);
  await sleep(700);
  assert(
    (await count("chat_message")) === 1,
    "cleared prefs → push delivered again (officer)",
  );

  // 7) Preference matrix also covers users (not just officers)
  const uGet = await api(
    "/api/chat/notification-prefs",
    {},
    tokUser(USER_WARD),
  );
  assert(
    uGet.status === 200 && uGet.body.data.prefs.push_enabled === true,
    "user prefs readable (defaults)",
  );
  const uPut = await api(
    "/api/chat/notification-prefs",
    { method: "PUT", body: JSON.stringify({ dnd: true }) },
    tokUser(USER_WARD),
  );
  assert(
    uPut.body.data.prefs.dnd === true,
    "user prefs writable (dnd=true)",
  );

  // cleanup
  await db.query("DELETE FROM chats WHERE id=$1", [chatId]);
  await db.query(
    "DELETE FROM chat_notification_prefs WHERE (party_kind,party_id) IN (('officer',$1),('user',$2))",
    [RITA, USER_WARD],
  );
  await db.query(
    "DELETE FROM notifications WHERE officer_id=$1 AND type IN ('chat_message','chat_mention')",
    [RITA],
  );
  await db.end();
  console.log("\nALL SPRINT 7 DoD CHECKS PASSED");
  process.exit(0);
};
main().catch(async (e) => {
  console.error(e);
  try { await db.end(); } catch {}
  process.exit(1);
});
