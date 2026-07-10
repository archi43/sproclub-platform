/**
 * RGPD — erasure account decision (INC-11), pure rule tested off-DB. Proves the
 * most sensitive invariant of the right-to-erasure: never delete a global account
 * that is referenced elsewhere (which would cascade-delete unrelated people's
 * data); in that case only revoke the student membership in this org.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAccountErasure } from "../src/lib/rgpd-rules.ts";

const ORG = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

test("deletes the account when the person is a student SOLELY in this org and referenced nowhere", () => {
  assert.equal(decideAccountErasure(ORG, [{ org_id: ORG, role: "student" }], false), "delete-account");
});

test("keeps the account when the person also belongs to another org", () => {
  const mems = [{ org_id: ORG, role: "student" }, { org_id: OTHER, role: "student" }];
  assert.equal(decideAccountErasure(ORG, mems, false), "revoke-student-membership");
});

test("keeps the account when the person also has a staff/coach role in this org", () => {
  const mems = [{ org_id: ORG, role: "student" }, { org_id: ORG, role: "coach" }];
  assert.equal(decideAccountErasure(ORG, mems, false), "revoke-student-membership");
});

test("keeps the account when referenced as an evaluator or a Cal.eu host", () => {
  assert.equal(decideAccountErasure(ORG, [{ org_id: ORG, role: "student" }], true), "revoke-student-membership");
});

test("keeps the account when there is no student membership to key on", () => {
  assert.equal(decideAccountErasure(ORG, [], false), "revoke-student-membership");
});
