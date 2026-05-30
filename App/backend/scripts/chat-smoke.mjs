// Sprint 3 DoD smoke test. Not part of the build/test suite — run manually
// against a running server: PORT=5055 node scripts/chat-smoke.mjs
import "dotenv/config";
import jwt from "jsonwebtoken";
import { io } from "socket.io-client";

const PORT = process.env.PORT || 5055;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = process.env.JWT_ACCESS_SECRET;

const WARD_A = "2b4296db-bec1-4c56-b0e7-57a2b6ce7844";
const SUBASH = "0958fbc0-4264-48ff-9c5d-e3b4218416f6"; // ward A officer
const RITA = "6519cd75-394e-477b-8370-15d993645759"; // ward A officer
const SURESH = "1c417395-1d68-4fa7-9d76-0f49b3e92c9a"; // different ward

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

const assert = (cond, msg) => {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("  ok:", msg);
};

const main = async () => {
  // 1) Subash creates an officer_ward chat in ward A
  const created = await api(
    "/api/chat",
    { method: "POST", body: JSON.stringify({ type: "officer_ward", wardId: WARD_A }) },
    tok(SUBASH),
  );
  assert(created.status === 201, `chat created (${created.status})`);
  const chatId = created.body.data.chat.id;

  // 2) Rita (same ward, no explicit participant row) connects + joins
  const rita = connect(tok(RITA));
  const received = new Promise((resolve) =>
    rita.on("message.created", resolve),
  );
  await new Promise((res, rej) => {
    rita.on("connect", res);
    rita.on("connect_error", rej);
  });
  const ritaJoin = await rita.emitWithAck("chat:join", { chatId });
  assert(ritaJoin.ok === true, "ward officer joins via type-derived access");

  // 3) Suresh (different ward, no grant) is rejected
  const suresh = connect(tok(SURESH));
  await new Promise((res) => suresh.on("connect", res));
  const sureshJoin = await suresh.emitWithAck("chat:join", { chatId });
  assert(
    sureshJoin.ok === false,
    `unauthorized room join rejected (${sureshJoin.error})`,
  );

  // 4) Subash sends a message via REST; Rita gets it over the socket
  const send1 = await api(
    `/api/chat/${chatId}/messages`,
    { method: "POST", body: JSON.stringify({ body: "hello rita", clientMsgId: "c1" }) },
    tok(SUBASH),
  );
  assert(send1.status === 201, "message sent");
  const msg1 = send1.body.data.message;
  const ev = await Promise.race([
    received,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
  ]);
  assert(ev.body === "hello rita", "real-time delivery via chat_events bridge");

  // 5) Idempotent retry of the same client_msg_id
  const send1b = await api(
    `/api/chat/${chatId}/messages`,
    { method: "POST", body: JSON.stringify({ body: "hello rita", clientMsgId: "c1" }) },
    tok(SUBASH),
  );
  assert(
    send1b.status === 200 && send1b.body.data.deduped === true &&
      send1b.body.data.message.id === msg1.id,
    "duplicate client_msg_id deduped",
  );

  // 6) Reconnect replay: Rita drops, misses msg2, replays via ?after=
  rita.disconnect();
  const cursor = Buffer.from(
    `${msg1.created_us}|${msg1.id}`,
    "utf8",
  ).toString("base64url");
  await api(
    `/api/chat/${chatId}/messages`,
    { method: "POST", body: JSON.stringify({ body: "missed msg2", clientMsgId: "c2" }) },
    tok(SUBASH),
  );
  const replay = await api(
    `/api/chat/${chatId}/messages?after=${cursor}`,
    {},
    tok(RITA),
  );
  const bodies = replay.body.data.messages.map((m) => m.body);
  assert(
    bodies.includes("missed msg2") && !bodies.includes("hello rita"),
    "reconnect replays only missed messages",
  );

  suresh.disconnect();

  // cleanup
  const pg = (await import("pg")).default;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query("DELETE FROM chats WHERE id = $1", [chatId]);
  await c.end();

  console.log("\nALL SPRINT 3 DoD CHECKS PASSED");
  process.exit(0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
