// Sprint 5 DoD smoke: escalation (audited + notified), status lifecycle,
// closed blocks sends, acknowledge recorded + audited.
//   PORT=5055 node --import tsx src/server.ts
//   PORT=5055 node scripts/chat-smoke-s5.mjs
import "dotenv/config";
import jwt from "jsonwebtoken";
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
const assert = (c, m) => {
  if (!c) throw new Error("FAIL: " + m);
  console.log("  ok:", m);
};
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const auditActions = async (chatId) =>
  (
    await db.query(
      "SELECT action FROM chat_audit_log WHERE chat_id=$1 ORDER BY created_at",
      [chatId],
    )
  ).rows.map((r) => r.action);

const main = async () => {
  await db.connect();
  await db.query(
    "DELETE FROM notifications WHERE officer_id=$1 AND type IN ('chat_escalated','chat_closed')",
    [RITA],
  );

  // ward_municipality chat: Subash (ward side, admin) + Rita explicit grant
  const created = await api(
    "/api/chat",
    {
      method: "POST",
      body: JSON.stringify({
        type: "ward_municipality",
        wardId: WARD_A,
        participants: [{ kind: "officer", id: RITA, role: "member" }],
      }),
    },
    tok(SUBASH),
  );
  assert(created.status === 201, "ward_municipality chat created");
  const chatId = created.body.data.chat.id;

  // 1) Escalate ward -> municipality
  const esc = await api(
    `/api/chat/${chatId}/escalate`,
    {
      method: "POST",
      body: JSON.stringify({
        reason: "Unresolved within SLA, escalating to municipality",
        priority: "urgent",
      }),
    },
    tok(SUBASH),
  );
  assert(
    esc.status === 200 && esc.body.data.chat.status === "escalated" &&
      esc.body.data.chat.priority === "urgent",
    "escalation set status=escalated, priority=urgent",
  );
  const a1 = await auditActions(chatId);
  assert(
    a1.includes("chat.created") && a1.includes("chat.escalated"),
    `audit trail has chat.created + chat.escalated (${a1.join(",")})`,
  );
  const escNotif = (
    await db.query(
      "SELECT count(*)::int n FROM notifications WHERE officer_id=$1 AND type='chat_escalated'",
      [RITA],
    )
  ).rows[0].n;
  assert(escNotif === 1, "municipality participant notified of escalation");

  // 2) Acknowledge recorded + audited
  const send = await api(
    `/api/chat/${chatId}/messages`,
    { method: "POST", body: JSON.stringify({ body: "please confirm receipt" }) },
    tok(SUBASH),
  );
  const msgId = send.body.data.message.id;
  const ack = await api(
    `/api/chat/${chatId}/messages/${msgId}/ack`,
    { method: "POST", body: "{}" },
    tok(RITA),
  );
  assert(ack.status === 200 && ack.body.data.acknowledged, "ack endpoint ok");
  const rcpt = (
    await db.query(
      `SELECT acknowledged_at FROM message_receipts
        WHERE message_id=$1 AND party_kind='officer' AND party_id=$2`,
      [msgId, RITA],
    )
  ).rows[0];
  assert(rcpt && rcpt.acknowledged_at, "message_receipts.acknowledged_at set");
  assert(
    (await auditActions(chatId)).includes("message.acknowledged"),
    "acknowledge audited",
  );

  // 3) Status lifecycle + closed blocks sends
  const toResolved = await api(
    `/api/chat/${chatId}/status`,
    { method: "POST", body: JSON.stringify({ status: "resolved" }) },
    tok(SUBASH),
  );
  assert(toResolved.body.data.status === "resolved", "escalated -> resolved");
  const toClosed = await api(
    `/api/chat/${chatId}/status`,
    { method: "POST", body: JSON.stringify({ status: "closed" }) },
    tok(SUBASH),
  );
  assert(toClosed.body.data.status === "closed", "resolved -> closed");

  const blocked = await api(
    `/api/chat/${chatId}/messages`,
    { method: "POST", body: JSON.stringify({ body: "after close" }) },
    tok(SUBASH),
  );
  assert(
    blocked.status === 403 && /chat_closed/.test(blocked.body.error),
    "closed chat blocks sends (403 chat_closed)",
  );

  const illegal = await api(
    `/api/chat/${chatId}/status`,
    { method: "POST", body: JSON.stringify({ status: "escalated" }) },
    tok(SUBASH),
  );
  assert(
    illegal.status === 400 && /Illegal transition/.test(illegal.body.error),
    "illegal transition closed -> escalated rejected",
  );

  const reopened = await api(
    `/api/chat/${chatId}/status`,
    { method: "POST", body: JSON.stringify({ status: "reopened" }) },
    tok(SUBASH),
  );
  assert(reopened.body.data.status === "reopened", "closed -> reopened allowed");

  // 4) Audit endpoint returns the full trail
  const auditApi = await api(`/api/chat/${chatId}/audit`, {}, tok(RITA));
  const actions = auditApi.body.data.audit.map((r) => r.action);
  assert(
    auditApi.status === 200 &&
      ["chat.created", "chat.escalated", "message.acknowledged",
       "chat.status_changed"].every((x) => actions.includes(x)),
    "GET /audit returns complete audited history",
  );

  await db.query("DELETE FROM chats WHERE id=$1", [chatId]);
  await db.query(
    "DELETE FROM notifications WHERE officer_id=$1 AND type IN ('chat_escalated','chat_closed')",
    [RITA],
  );
  await db.end();
  console.log("\nALL SPRINT 5 DoD CHECKS PASSED");
  process.exit(0);
};
main().catch(async (e) => {
  console.error(e);
  try { await db.end(); } catch {}
  process.exit(1);
});
