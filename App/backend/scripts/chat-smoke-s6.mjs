// Sprint 6 DoD smoke: secured attachments.
//   CHAT_ATTACHMENT_MAX_BYTES=200000 PORT=5055 node --import tsx src/server.ts
//   PORT=5055 node scripts/chat-smoke-s6.mjs
import "dotenv/config";
import jwt from "jsonwebtoken";
import pg from "pg";

const PORT = process.env.PORT || 5055;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = process.env.JWT_ACCESS_SECRET;

const WARD_A = "2b4296db-bec1-4c56-b0e7-57a2b6ce7844";
const WARD_B = "a8da091d-1f0b-41c9-bfff-943cb7a14a2d";
const SUBASH = "0958fbc0-4264-48ff-9c5d-e3b4218416f6"; // ward A
const SURESH = "1c417395-1d68-4fa7-9d76-0f49b3e92c9a"; // ward B (outsider)

const tok = (id, ward) =>
  jwt.sign(
    { id, email: `${id}@t.local`, role: "officer", kind: "officer", ward_id: ward },
    SECRET,
    { expiresIn: "10m" },
  );

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=",
  "base64",
);

const json = (path, opts, token) =>
  fetch(BASE + path, {
    ...opts,
    headers: { authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });

const upload = async (chatId, token, fileBuf, name, mime) => {
  const fd = new FormData();
  fd.append("file", new File([fileBuf], name, { type: mime }));
  const r = await fetch(`${BASE}/api/chat/${chatId}/attachments`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: fd,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const assert = (c, m) => {
  if (!c) throw new Error("FAIL: " + m);
  console.log("  ok:", m);
};
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const actions = async (chatId) =>
  (
    await db.query(
      "SELECT action FROM chat_audit_log WHERE chat_id=$1",
      [chatId],
    )
  ).rows.map((r) => r.action);

const main = async () => {
  await db.connect();
  const created = await (
    await json(
      "/api/chat",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "officer_ward", wardId: WARD_A }),
      },
      tok(SUBASH, WARD_A),
    )
  ).json();
  const chatId = created.data.chat.id;
  assert(!!chatId, "officer_ward chat created");

  // 1) Disallowed type (a text file) rejected by magic-byte check
  const bad = await upload(
    chatId,
    tok(SUBASH, WARD_A),
    Buffer.from("hello not an image"),
    "notes.txt",
    "text/plain",
  );
  assert(bad.status === 415, `disallowed type rejected (${bad.status})`);

  // 2) Oversized rejected (limit set to 200000 bytes for the test server)
  const big = await upload(
    chatId,
    tok(SUBASH, WARD_A),
    Buffer.concat([PNG_1x1, Buffer.alloc(300_000, 1)]),
    "big.png",
    "image/png",
  );
  assert(big.status === 413, `oversized rejected (${big.status})`);

  // 3) Valid image upload
  const ok = await upload(
    chatId,
    tok(SUBASH, WARD_A),
    PNG_1x1,
    "pic.png",
    "image/png",
  );
  assert(
    ok.status === 201 && ok.body.data.attachment.scan_status === "clean",
    "valid PNG uploaded (scan_status clean)",
  );
  const attId = ok.body.data.attachment.id;

  // 4) Preview works: authorized download streams bytes
  const dl = await json(`/api/chat/attachments/${attId}`, {}, tok(SUBASH, WARD_A));
  const buf = Buffer.from(await dl.arrayBuffer());
  assert(
    dl.status === 200 &&
      dl.headers.get("content-type") === "image/png" &&
      buf.length > 0 &&
      buf[0] === 0x89,
    `authorized download streams PNG bytes (${buf.length}B)`,
  );
  const thumb = await json(
    `/api/chat/attachments/${attId}?thumb=1`,
    {},
    tok(SUBASH, WARD_A),
  );
  assert(thumb.status === 200, "thumbnail variant served");

  // 5) Unauthorized fetch -> 403 + audited
  const denied = await json(
    `/api/chat/attachments/${attId}`,
    {},
    tok(SURESH, WARD_B),
  );
  assert(denied.status === 403, `outsider download blocked (${denied.status})`);
  const acts = await actions(chatId);
  assert(
    acts.includes("attachment.uploaded") &&
      acts.includes("attachment.downloaded") &&
      acts.includes("attachment.download_denied"),
    `audit has uploaded + downloaded + download_denied (${[...new Set(acts)].join(",")})`,
  );

  await db.query("DELETE FROM chats WHERE id=$1", [chatId]);
  await db.end();
  console.log("\nALL SPRINT 6 DoD CHECKS PASSED");
  process.exit(0);
};
main().catch(async (e) => {
  console.error(e);
  try { await db.end(); } catch {}
  process.exit(1);
});
