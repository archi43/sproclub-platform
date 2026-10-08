import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchResourceSource, type ResourceSource } from "@/lib/sync/resource-source";
import { planResourceAssignments, shouldApplyRemovals, staleAssignmentIds, type AssignmentSkipReason } from "@/lib/resource-rules";
import { isErasedEmail } from "@/lib/rgpd-rules";

/**
 * Reflet des affectations de ressources (INC-30) : Airtable → `resource_assignments`.
 *
 * Miroir complet de la fenêtre lue : création, mise à jour, et retrait des
 * lignes que la source ne porte plus. Le retrait est sûr parce que la table est
 * produite **entièrement** par cette synchronisation (aucune policy d'écriture) :
 * on ne coupe jamais ce qu'on n'a pas créé.
 *
 * Le client service-role est injecté : l'appelant (cron, action manuelle) a
 * déjà prouvé son droit d'agir. La source l'est aussi, pour les tests.
 */

export interface ResourceSyncStats {
  read: number;
  upserted: number;
  removed: number;
  skipped: Record<AssignmentSkipReason, number>;
}

interface EnrollmentRef {
  id: string;
  airtable_record_id: string;
  learners_ro: { email: string | null } | null;
}

export async function syncResourceAssignments(
  admin: SupabaseClient,
  orgId: string,
  deps: { source?: () => Promise<ResourceSource> } = {}
): Promise<ResourceSyncStats> {
  const source = await (deps.source ?? fetchResourceSource)();

  const { data: enrollments, error: enrErr } = await admin
    .from("enrollments_ro")
    .select("id, airtable_record_id, learners_ro(email)")
    .eq("org_id", orgId)
    .returns<EnrollmentRef[]>();
  if (enrErr) throw new Error(`resource sync: enrollments: ${enrErr.message}`);

  const enrollmentByCommande = new Map<string, string>();
  const erasedEnrollments = new Set<string>();
  for (const e of enrollments ?? []) {
    enrollmentByCommande.set(e.airtable_record_id, e.id);
    if (isErasedEmail(e.learners_ro?.email)) erasedEnrollments.add(e.id);
  }

  const plan = planResourceAssignments({ ...source, enrollmentByCommande, erasedEnrollments });

  const now = new Date().toISOString();
  if (plan.rows.length > 0) {
    const { error } = await admin
      .from("resource_assignments")
      .upsert(plan.rows.map((r) => ({ ...r, org_id: orgId, synced_at: now })), {
        onConflict: "org_id,airtable_record_id,airtable_resource_id",
      });
    if (error) throw new Error(`resource sync: upsert: ${error.message}`);
  }

  const { data: existing, error: exErr } = await admin
    .from("resource_assignments")
    .select("id, airtable_record_id, airtable_resource_id")
    .eq("org_id", orgId);
  if (exErr) throw new Error(`resource sync: existing: ${exErr.message}`);

  const removalsAllowed = shouldApplyRemovals(source.assignments.length, (existing ?? []).length);
  if (!removalsAllowed) {
    throw new Error(
      `resource sync: la source ne rend aucune affectation alors que ${(existing ?? []).length} sont reflétées ; rien n'est retiré`
    );
  }
  const stale = staleAssignmentIds(existing ?? [], plan.rows);
  if (stale.length > 0) {
    const { error } = await admin.from("resource_assignments").delete().eq("org_id", orgId).in("id", stale);
    if (error) throw new Error(`resource sync: delete: ${error.message}`);
  }

  return { read: source.assignments.length, upserted: plan.rows.length, removed: stale.length, skipped: plan.skipped };
}
