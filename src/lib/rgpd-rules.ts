/**
 * RGPD erasure rules — pure, tested off-DB (same pattern as compliance-rules /
 * reporting-rules). Keeps the most sensitive erasure invariant provable without a
 * database or a request context.
 */

export interface AccountMembership {
  org_id: string;
  role: string;
}

export type AccountErasureAction = "delete-account" | "revoke-student-membership";

/**
 * Decide what to do with a person's GLOBAL account when erasing their dossier in
 * `orgId`. `profiles.email` is unique globally and several FKs to profiles cascade
 * on delete (evaluator juries, host availabilities, memberships), so deleting the
 * account of someone used elsewhere would cascade-delete UNRELATED people's data.
 *
 * Therefore delete the whole account ONLY when it is used SOLELY as a student in
 * THIS org and referenced nowhere else (as an evaluator or a Cal.eu host). In
 * every other case — member of another org, staff/coach here, or referenced
 * elsewhere — only the student membership in this org is revoked.
 */
export function decideAccountErasure(
  orgId: string,
  memberships: AccountMembership[],
  referencedElsewhere: boolean
): AccountErasureAction {
  const onlyStudentHere =
    memberships.length > 0 && memberships.every((m) => m.org_id === orgId && m.role === "student");
  return onlyStudentHere && !referencedElsewhere ? "delete-account" : "revoke-student-membership";
}
