// Permission matrix for evaluateChatAccess (pure rule engine — no DB).
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateChatAccess, } from "../access";
const WARD_A = "11111111-1111-1111-1111-111111111111";
const WARD_B = "22222222-2222-2222-2222-222222222222";
const MUNI_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const MUNI_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
function principal(p) {
    return {
        kind: "officer",
        id: "p-1",
        role: "officer",
        officerType: null,
        wardId: null,
        municipalityId: null,
        departmentId: null,
        ...p,
    };
}
function chat(p) {
    return {
        id: "c-1",
        type: "officer_ward",
        status: "open",
        ward_id: null,
        municipality_id: null,
        complaint_id: null,
        ...p,
    };
}
const member = { role_in_chat: "member", is_active: true };
const admin = { role_in_chat: "admin", is_active: true };
const viewer = { role_in_chat: "viewer", is_active: true };
test("officer_ward: ward officer in matching ward can read+write", () => {
    const pr = principal({ officerType: "ward_officer", wardId: WARD_A });
    const c = chat({ type: "officer_ward", ward_id: WARD_A });
    assert.equal(evaluateChatAccess(pr, c, null, "read").allowed, true);
    assert.equal(evaluateChatAccess(pr, c, null, "write").allowed, true);
});
test("officer_ward: officer from a different ward is denied", () => {
    const pr = principal({ officerType: "ward_officer", wardId: WARD_B });
    const c = chat({ type: "officer_ward", ward_id: WARD_A });
    const d = evaluateChatAccess(pr, c, null, "read");
    assert.equal(d.allowed, false);
    assert.equal(d.reason, "not_a_member");
});
test("officer_ward: a ward's user (citizen) in that ward can read", () => {
    const pr = principal({
        kind: "user",
        role: "citizen",
        officerType: null,
        wardId: WARD_A,
    });
    const c = chat({ type: "officer_ward", ward_id: WARD_A });
    assert.equal(evaluateChatAccess(pr, c, null, "read").allowed, true);
});
test("municipality_internal: ward officer is BLOCKED without explicit grant", () => {
    const pr = principal({
        officerType: "ward_officer",
        wardId: WARD_A,
        municipalityId: MUNI_A,
    });
    const c = chat({ type: "municipality_internal", municipality_id: MUNI_A });
    const d = evaluateChatAccess(pr, c, null, "read");
    assert.equal(d.allowed, false);
    assert.equal(d.reason, "not_a_member");
});
test("municipality_internal: ward officer WITH explicit participant grant is allowed", () => {
    const pr = principal({
        officerType: "ward_officer",
        wardId: WARD_A,
        municipalityId: MUNI_A,
    });
    const c = chat({ type: "municipality_internal", municipality_id: MUNI_A });
    const d = evaluateChatAccess(pr, c, member, "write");
    assert.equal(d.allowed, true);
    assert.equal(d.reason, "participant_grant");
});
test("municipality_internal: municipality officer in matching municipality allowed", () => {
    const pr = principal({
        officerType: "municipality_officer",
        municipalityId: MUNI_A,
    });
    const c = chat({ type: "municipality_internal", municipality_id: MUNI_A });
    assert.equal(evaluateChatAccess(pr, c, null, "write").allowed, true);
});
test("municipality_internal: municipality officer from another municipality denied", () => {
    const pr = principal({
        officerType: "municipality_officer",
        municipalityId: MUNI_B,
    });
    const c = chat({ type: "municipality_internal", municipality_id: MUNI_A });
    assert.equal(evaluateChatAccess(pr, c, null, "read").allowed, false);
});
test("municipality_internal: ward-role user blocked even in matching municipality", () => {
    const pr = principal({
        kind: "user",
        role: "ward",
        municipalityId: MUNI_A,
    });
    const c = chat({ type: "municipality_internal", municipality_id: MUNI_A });
    assert.equal(evaluateChatAccess(pr, c, null, "read").allowed, false);
});
test("ward_municipality: either the ward side or municipality side is allowed", () => {
    const c = chat({
        type: "ward_municipality",
        ward_id: WARD_A,
        municipality_id: MUNI_A,
    });
    const wardSide = principal({ officerType: "ward_officer", wardId: WARD_A });
    const muniSide = principal({
        officerType: "municipality_officer",
        municipalityId: MUNI_A,
    });
    assert.equal(evaluateChatAccess(wardSide, c, null, "write").allowed, true);
    assert.equal(evaluateChatAccess(muniSide, c, null, "write").allowed, true);
});
test("complaint_case: no access without an explicit participant row", () => {
    const pr = principal({ officerType: "ward_officer", wardId: WARD_A });
    const c = chat({ type: "complaint_case", ward_id: WARD_A });
    const d = evaluateChatAccess(pr, c, null, "read");
    assert.equal(d.allowed, false);
    assert.equal(d.reason, "not_a_member");
});
test("complaint_case: explicit participant is allowed", () => {
    const pr = principal({ officerType: "ward_officer", wardId: WARD_A });
    const c = chat({ type: "complaint_case" });
    assert.equal(evaluateChatAccess(pr, c, member, "read").allowed, true);
});
test("viewer participant is read-only", () => {
    const pr = principal({ wardId: WARD_A });
    const c = chat({ type: "officer_ward", ward_id: WARD_A });
    assert.equal(evaluateChatAccess(pr, c, viewer, "read").allowed, true);
    const w = evaluateChatAccess(pr, c, viewer, "write");
    assert.equal(w.allowed, false);
    assert.equal(w.reason, "viewer_read_only");
});
test("inactive participant is denied outright", () => {
    const pr = principal({ wardId: WARD_A });
    const c = chat({ type: "officer_ward", ward_id: WARD_A });
    const d = evaluateChatAccess(pr, c, { role_in_chat: "member", is_active: false }, "read");
    assert.equal(d.allowed, false);
    assert.equal(d.reason, "participant_inactive");
});
test("manage requires an admin participant row", () => {
    const pr = principal({ wardId: WARD_A });
    const c = chat({ type: "officer_ward", ward_id: WARD_A });
    assert.equal(evaluateChatAccess(pr, c, member, "manage").reason, "manage_requires_admin");
    assert.equal(evaluateChatAccess(pr, c, admin, "manage").allowed, true);
    // Type-derived membership never confers manage.
    assert.equal(evaluateChatAccess(pr, c, null, "manage").reason, "manage_requires_admin");
});
test("closed/resolved chats block writes but still allow reads", () => {
    const pr = principal({ wardId: WARD_A });
    for (const status of ["closed", "resolved"]) {
        const c = chat({ type: "officer_ward", ward_id: WARD_A, status });
        assert.equal(evaluateChatAccess(pr, c, member, "read").allowed, true);
        const w = evaluateChatAccess(pr, c, member, "write");
        assert.equal(w.allowed, false);
        assert.equal(w.reason, "chat_closed");
    }
});
test("workflow actions bypass the closed/resolved write block", () => {
    const pr = principal({ wardId: WARD_A });
    for (const status of ["closed", "resolved"]) {
        const c = chat({ type: "officer_ward", ward_id: WARD_A, status });
        // a plain message is still blocked...
        assert.equal(evaluateChatAccess(pr, c, member, "write").reason, "chat_closed");
        // ...but escalate/status/ack (workflow) can act to reopen it.
        assert.equal(evaluateChatAccess(pr, c, member, "workflow").allowed, true);
        assert.equal(evaluateChatAccess(pr, c, null, "workflow").allowed, true);
    }
});
test("viewers still cannot perform workflow actions", () => {
    const pr = principal({ wardId: WARD_A });
    const c = chat({ type: "officer_ward", ward_id: WARD_A, status: "closed" });
    assert.equal(evaluateChatAccess(pr, c, viewer, "workflow").reason, "viewer_read_only");
});
test("reopened chat allows writes again", () => {
    const pr = principal({ wardId: WARD_A });
    const c = chat({ type: "officer_ward", ward_id: WARD_A, status: "reopened" });
    assert.equal(evaluateChatAccess(pr, c, member, "write").allowed, true);
});
