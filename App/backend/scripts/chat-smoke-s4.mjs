// Sprint 4 DoD smoke: receipts, presence-aware push, mute policy, unread.
// Run against a server started with CHAT_PUSH_DEBOUNCE_MS=300:
//   CHAT_PUSH_DEBOUNCE_MS=300 PORT=5055 node --import tsx src/server.ts
//   PORT=5055 node scripts/chat-smoke-s4.mjs
import "dotenv/config";
import jwt from "jsonwebtoken";
import { io } from "socket.io-client";
import pg from "pg";

const PORT = process.env.PORT || 5055;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = process.env.JWT_ACCESS_SECRET;

const WARD_A = "2b4296db-bec1-4c56-b0e7-57a2b6ce7844";
const SUBASH = "0958fbc0-4264-48ff-9c5d-e3b4218416f6";
const RITA = "6519cd75-394e-477b-8370-15d993645759";

const tok = (id) =>
  jwt.sign(
    { id, email: `${id}@t.local`, role: "officer", kind: "officer", ward_id: WARD_A },
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
  return { status: r.status, body: await r.json() };
};
const connect = (token) =>
  io(`${BASE}/chat`, { auth: { token }, transports: ["websocket"] });
const onceConnected = (s) =>
  new Promise((res, rej) => {
    s.on("connect", res);
    s.on("connect_error", rej);
  });
const waitFor = (s, ev, ms = 4000) =>
  Promise.race([
    new Promise((res) => s.on(ev, res)),
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ev}`)), ms)),
  ]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => {
  if (!c) throw new Error("FAIL: " + m);
  console.log("  ok:", m);
};

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });

const chatMsgCount = async (officerId) =>
  (
    await db.query(
      "SELECT count(*)::int n FROM notifications WHERE officer_id=$1 AND type='chat_message'",
      [officerId],
    )
  ).rows[0].n;

const main = async () => {
  await db.connect();
  await db.query(
    "DELETE FROM notifications WHERE officer_id=$1 AND type='chat_message'",
    [RITA],
  );

  const created = await api(
    "/api/chat",
    { method: "POST", body: JSON.stringify({ type: "officer_ward", wardId: WARD_A }) },
    tok(SUBASH),
  );
  const chatId = created.body.data.chat.id;
  assert(created.status === 201, "chat created");

  const subash = connect(tok(SUBASH));
  const rita = connect(tok(RITA));
  await Promise.all([onceConnected(subash), onceConnected(rita)]);
  assert((await subash.emitWithAck("chat:join", { chatId })).ok, "subash joined");
  assert((await rita.emitWithAck("chat:join", { chatId })).ok,
    "rita joined (participant row materialized)");

  // 1) Presence-aware suppression: Rita is in the room -> no push
  const ritaMsg = waitFor(rita, "message.created");
  const ritaUnread = waitFor(rita, "unread.updated");
  const send1 = await api(
    `/api/chat/${chatId}/messages`,
    { method: "POST", body: JSON.stringify({ body: "m1", clientMsgId: "s4-1" }) },
    tok(SUBASH),
  );
  const m1 = send1.body.data.message;
  const ev = await ritaMsg;
  assert(ev.id === m1.id, "rita got message.created in room");
  const u = await ritaUnread;
  assert(u.chatId === chatId && u.unread >= 1, "rita got unread.updated nudge");
  await sleep(600); // past debounce window
  assert((await chatMsgCount(RITA)) === 0,
    "no push while actively viewing (presence suppression)");

  // 2) Delivered + read ticks fan out to the room
  const deliveredTick = waitFor(subash, "receipt.delivered");
  const d = await rita.emitWithAck("message.delivered", {
    chatId,
    messageIds: [m1.id],
  });
  assert(d.ok && d.count === 1, "rita delivered ack");
  const dt = await deliveredTick;
  assert(dt.messageIds.includes(m1.id) && dt.by.id === RITA,
    "subash saw receipt.delivered");

  const readTick = waitFor(subash, "receipt.read");
  const rd = await rita.emitWithAck("message.read", { chatId });
  assert(rd.ok && rd.unread === 0, "rita read ack, unread cleared");
  const rt = await readTick;
  assert(rt.by.id === RITA, "subash saw receipt.read");
  const rcpt = (
    await db.query(
      `SELECT delivered_at, read_at FROM message_receipts
        WHERE message_id=$1 AND party_kind='officer' AND party_id=$2`,
      [m1.id, RITA],
    )
  ).rows[0];
  assert(rcpt && rcpt.delivered_at && rcpt.read_at,
    "message_receipts has delivered_at + read_at");

  // 3) Muted + offline -> suppressed
  await db.query(
    `UPDATE chat_participants SET muted_until = now() + interval '1 hour'
      WHERE chat_id=$1 AND party_kind='officer' AND party_id=$2`,
    [chatId, RITA],
  );
  rita.disconnect();
  await sleep(150);
  await api(
    `/api/chat/${chatId}/messages`,
    { method: "POST", body: JSON.stringify({ body: "m2", clientMsgId: "s4-2" }) },
    tok(SUBASH),
  );
  await sleep(700);
  assert((await chatMsgCount(RITA)) === 0,
    "muted + offline recipient gets no push");

  // 4) Unmuted + offline -> coalesced push delivered
  await db.query(
    `UPDATE chat_participants SET muted_until = NULL
      WHERE chat_id=$1 AND party_kind='officer' AND party_id=$2`,
    [chatId, RITA],
  );
  for (const b of ["m3", "m4", "m5"]) {
    await api(
      `/api/chat/${chatId}/messages`,
      { method: "POST", body: JSON.stringify({ body: b, clientMsgId: "s4-" + b }) },
      tok(SUBASH),
    );
  }
  await sleep(800);
  const n = await chatMsgCount(RITA);
  assert(n === 1, `offline recipient got exactly 1 coalesced push (got ${n})`);
  const coalesced = (
    await db.query(
      `SELECT message, metadata FROM notifications
        WHERE officer_id=$1 AND type='chat_message'
        ORDER BY created_at DESC LIMIT 1`,
      [RITA],
    )
  ).rows[0];
  assert(/3 new messages/.test(coalesced.message),
    `coalesced into one summary ("${coalesced.message}")`);

  subash.disconnect();
  await db.query("DELETE FROM chats WHERE id=$1", [chatId]);
  await db.query(
    "DELETE FROM notifications WHERE officer_id=$1 AND type='chat_message'",
    [RITA],
  );
  await db.end();
  console.log("\nALL SPRINT 4 DoD CHECKS PASSED");
  process.exit(0);
};

main().catch(async (e) => {
  console.error(e);
  try { await db.end(); } catch {}
  process.exit(1);
});
