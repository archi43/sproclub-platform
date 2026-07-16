import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { decideAccountErasure } from "@/lib/rgpd-rules";

/**
 * RGPD (INC-11): audit trail, personal-data export, and right-to-erasure.
 *
 * Reads go through the RLS client (staff scope). The audit trail is written via
 * the SECURITY DEFINER `log_access` RPC (0017) — a caller can only record an
 * entry for their own org/identity. Erasure anonymizes the read-model with the
 * service role and registers a suppression so the sync never re-imports the PII.
 */

const BUCKET = "learner-docs";

export class RgpdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RgpdError";
  }
}

/** Record an audited access (fire-and-forget; a logging failure never blocks the
 *  actual read). */
export async function logDossierAccess(action: string, subjectId: string, detail?: string): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.rpc("log_access", {
      p_action: action,
      p_subject_type: "learner",
      p_subject_id: subjectId,
      p_detail: detail ?? null,
    });
  } catch {
    // Best-effort: a journalling failure must never block the actual read/action.
  }
}

export interface AuditEntry {
  action: string;
  actorEmail: string | null;
  detail: string | null;
  at: string;
}

/** The audit trail for one learner (staff read via RLS), with the actor's
 *  identity ("qui a consulté quoi, quand"). */
export async function learnerAuditTrail(orgId: string, learnerId: string, limit = 50): Promise<AuditEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("action, detail, at, actor:profiles(email)")
    .eq("org_id", orgId)
    .eq("subject_type", "learner")
    .eq("subject_id", learnerId)
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load audit trail: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    action: r.action as string,
    actorEmail: ((r.actor as { email: string } | null)?.email) ?? null,
    detail: (r.detail as string) ?? null,
    at: r.at as string,
  }));
}

/** Gather every piece of a person's personal data held by the platform, for a
 *  RGPD access/portability request. Read through RLS (staff scope). */
export async function exportPersonalData(orgId: string, learnerId: string): Promise<Record<string, unknown> | null> {
  const supabase = createClient();
  const { data: learner, error } = await supabase
    .from("learners_ro")
    .select("id, first_name, last_name, email, phone, city, trainee_type, unique_learner_id")
    .eq("org_id", orgId)
    .eq("id", learnerId)
    .maybeSingle();
  if (error) throw new RgpdError(error.message);
  if (!learner) return null;

  const enrollmentsRes = await supabase.from("enrollments_ro").select("*").eq("org_id", orgId).eq("learner_id", learnerId);
  const enrollmentIds = (enrollmentsRes.data ?? []).map((e) => (e as { id: string }).id);

  const learnerEmail = (learner as { email: string }).email;
  const [reservations, deliverables, reports, emissions, notifications] = await Promise.all([
    supabase.from("reservations").select("id, kind, project_number, starts_at, status").eq("org_id", orgId).eq("learner_id", learnerId),
    enrollmentIds.length
      ? supabase.from("project_deliverables").select("id, enrollment_id, project_number, deliverable_submitted, submitted_at").eq("org_id", orgId).in("enrollment_id", enrollmentIds)
      : Promise.resolve({ data: [] as unknown[] }),
    enrollmentIds.length
      ? supabase.from("coaching_reports").select("id, enrollment_id, session_date, body, grade, created_at").eq("org_id", orgId).in("enrollment_id", enrollmentIds)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase.from("document_emissions").select("kind, storage_path, generated_at").eq("org_id", orgId).eq("learner_email", learnerEmail),
    supabase.from("notifications").select("kind, subject, status, sent_at, created_at").eq("org_id", orgId).eq("recipient_email", learnerEmail),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    organizationId: orgId,
    learner,
    enrollments: enrollmentsRes.data ?? [],
    reservations: reservations.data ?? [],
    deliverables: deliverables.data ?? [],
    coachingReports: reports.data ?? [],
    documents: emissions.data ?? [],
    notifications: notifications.data ?? [],
  };
}

/**
 * Erase a learner (right to be forgotten): anonymize their identity in the
 * read-model, register a suppression so the sync never re-imports the PII, drop
 * their account + stored documents. Referential integrity is preserved — rows
 * are anonymized in place (the learner id and its FKs remain), never deleted.
 */
export async function eraseLearner(
  orgId: string,
  learnerId: string,
  deps: { db?: SupabaseClient; admin?: SupabaseClient } = {}
): Promise<void> {
  // Resolve the learner (RLS staff scope) to get the source e-mail. Clients are
  // injectable so the erasure branching can be proven end-to-end in tests.
  const supabase = deps.db ?? createClient();
  const { data: learner, error } = await supabase
    .from("learners_ro")
    .select("id, email")
    .eq("org_id", orgId)
    .eq("id", learnerId)
    .maybeSingle();
  if (error) throw new RgpdError(error.message);
  if (!learner) throw new RgpdError("Apprenant introuvable.");
  const email = (learner as { email: string }).email.toLowerCase();

  const admin = deps.admin ?? adminClient();

  // 1) Register the suppression (idempotent) so the sync stops re-importing.
  const { error: supErr } = await admin
    .from("data_erasures")
    .upsert({ org_id: orgId, learner_email: email }, { onConflict: "org_id,learner_email" });
  if (supErr) throw new RgpdError(supErr.message);

  // 2) Anonymize the learner row in place (identifiers removed, id kept).
  const tombstone = `erased-${learnerId}@erased.invalid`;
  const { error: anonErr } = await admin
    .from("learners_ro")
    .update({ first_name: "Anonymisé", last_name: null, email: tombstone, phone: null, city: null })
    .eq("org_id", orgId)
    .eq("id", learnerId);
  if (anonErr) throw new RgpdError(anonErr.message);

  // 3) Anonymize free-text insertion identifiers on their enrollments.
  await admin
    .from("enrollments_ro")
    .update({ insertion_company: null, insertion_role: null })
    .eq("org_id", orgId)
    .eq("learner_id", learnerId);

  // 3b) Purge the notification journal + opt-out prefs for this person (INC-7):
  //     subject/body/recipient hold the name & e-mail in clear — no legal reason
  //     to keep a relance journal after erasure. No downstream FK, so delete.
  await admin.from("notifications").delete().eq("org_id", orgId).eq("recipient_email", email);
  await admin.from("notification_prefs").delete().eq("org_id", orgId).eq("email", email);

  // 3c) Retirer du vivier de talents (INC-17) : le consentement s'éteint avec
  //     l'effacement — la ligne disparaît, la vue partenaire ne les liste plus
  //     (ceinture : la vue exclut aussi tout e-mail présent dans data_erasures).
  await admin.from("talent_profiles").delete().eq("org_id", orgId).eq("learner_id", learnerId);

  // 4) Remove their stored documents (folder keyed by the original e-mail).
  //    Errors must surface — otherwise we'd claim erasure while PII files remain.
  //    Paginate: a single list() caps at 100, so a large folder would leave PII.
  const folder = `${orgId}/${email}`;
  const files: string[] = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const list = await admin.storage.from(BUCKET).list(folder, { limit: pageSize, offset });
    if (list.error) throw new RgpdError(`Suppression des documents impossible : ${list.error.message}`);
    const page = (list.data ?? []).filter((f) => f.id !== null);
    files.push(...page.map((f) => `${folder}/${f.name}`));
    if (page.length < pageSize) break;
  }
  if (files.length) {
    const rm = await admin.storage.from(BUCKET).remove(files);
    if (rm.error) throw new RgpdError(`Suppression des documents impossible : ${rm.error.message}`);
  }

  // 5) Revoke the person's STUDENT access. `profiles.email` is unique GLOBALLY,
  //    and several FKs to profiles cascade on delete (evaluator juries, host
  //    availabilities, memberships). So only delete the whole account when it is
  //    used SOLELY as a student in THIS org and referenced nowhere else —
  //    otherwise deleting it would cascade-delete unrelated people's data (a
  //    former student who is now a coach/evaluator, or a member of another org).
  const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (profile?.id) {
    const pid = profile.id as string;
    const [mems, asEvaluator, asHost] = await Promise.all([
      admin.from("memberships").select("org_id, role").eq("profile_id", pid),
      admin.from("reservation_evaluators").select("evaluator_id", { count: "exact", head: true }).eq("evaluator_id", pid),
      admin.from("availabilities").select("id", { count: "exact", head: true }).eq("host_id", pid),
    ]);
    const memberships = (mems.data ?? []) as { org_id: string; role: string }[];
    const referencedElsewhere = (asEvaluator.count ?? 0) > 0 || (asHost.count ?? 0) > 0;
    if (decideAccountErasure(orgId, memberships, referencedElsewhere) === "delete-account") {
      // Errors must surface: otherwise we'd report a successful erasure while the
      // account (auth user + profile) still holds the person's identity.
      const delProfile = await admin.from("profiles").delete().eq("id", pid); // student memberships cascade
      if (delProfile.error) throw new RgpdError(`Suppression du profil impossible : ${delProfile.error.message}`);
      const delUser = await admin.auth.admin.deleteUser(pid);
      if (delUser.error) throw new RgpdError(`Suppression du compte impossible : ${delUser.error.message}`);
    } else {
      // Keep the account (used elsewhere); just remove their student access here.
      await admin.from("memberships").delete().eq("org_id", orgId).eq("profile_id", pid).eq("role", "student");
    }
  }
}
