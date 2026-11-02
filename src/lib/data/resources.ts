import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { fetchResourcePassword } from "@/lib/sync/resource-source";
import { assignmentStatus, canRevealPassword, sortForDisplay, type AssignmentStatus } from "@/lib/resource-rules";

/**
 * Accès aux ressources (INC-30), côté lecture.
 *
 * La liste passe par la RLS (`resource_assignments_*_read`) : l'apprenant ne
 * reçoit que ses lignes, la coordination celles de l'organisme. Le mot de passe
 * ne passe jamais par Postgres : `revealMyResourcePassword` obtient l'identifiant
 * du compte par la fonction `reveal_resource_assignment`, qui vérifie la
 * propriété et la période puis journalise, et seulement ensuite lit Airtable.
 */

export interface ResourceAccess {
  id: string;
  enrollmentId: string;
  program: string | null;
  label: string;
  type: string | null;
  category: string | null;
  startsOn: string | null;
  endsOn: string | null;
  status: AssignmentStatus;
  canReveal: boolean;
}

type RawAssignment = {
  id: string;
  enrollment_id: string;
  resource_label: string;
  resource_type: string | null;
  resource_category: string | null;
  starts_on: string | null;
  ends_on: string | null;
  enrollments_ro: { program: string | null } | null;
};

/** Date du jour à Paris, au format ISO : c'est le calendrier des apprenants qui
 *  fait foi pour une période d'accès, pas celui du serveur (UTC). */
export function todayInParis(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now);
}

const SELECT =
  "id, enrollment_id, resource_label, resource_type, resource_category, starts_on, ends_on, enrollments_ro(program)";

function toAccess(r: RawAssignment, today: string): ResourceAccess {
  const status = assignmentStatus(r.starts_on, r.ends_on, today);
  return {
    id: r.id,
    enrollmentId: r.enrollment_id,
    program: r.enrollments_ro?.program ?? null,
    label: r.resource_label,
    type: r.resource_type,
    category: r.resource_category,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    status,
    canReveal: canRevealPassword(status),
  };
}

/** Accès de l'apprenant connecté (RLS : ses seuls dossiers). */
export async function getMyResources(orgId: string, db?: SupabaseClient): Promise<ResourceAccess[]> {
  const supabase = db ?? createClient();
  const { data, error } = await supabase
    .from("resource_assignments")
    .select(SELECT)
    .eq("org_id", orgId)
    .returns<RawAssignment[]>();
  if (error) throw new Error(`Failed to load resource access: ${error.message}`);
  const today = todayInParis();
  return sortForDisplay((data ?? []).map((r) => toAccess(r, today)));
}

/** Accès d'un dossier, pour la fiche apprenant de la coordination (RLS staff). */
export async function getEnrollmentResources(
  orgId: string,
  enrollmentIds: string[],
  db?: SupabaseClient
): Promise<ResourceAccess[]> {
  if (enrollmentIds.length === 0) return [];
  const supabase = db ?? createClient();
  const { data, error } = await supabase
    .from("resource_assignments")
    .select(SELECT)
    .eq("org_id", orgId)
    .in("enrollment_id", enrollmentIds)
    .returns<RawAssignment[]>();
  if (error) throw new Error(`Failed to load resource access: ${error.message}`);
  const today = todayInParis();
  return sortForDisplay((data ?? []).map((r) => toAccess(r, today)));
}

export type RevealResult =
  | { ok: true; password: string }
  | { ok: false; reason: "refused" | "empty" | "unavailable" };

/**
 * Mot de passe d'une affectation de l'apprenant connecté.
 *
 * `refused` couvre indistinctement « pas à vous », « hors période » et « n'existe
 * pas » : distinguer les cas renseignerait un appelant curieux sur les
 * affectations des autres.
 */
export async function revealMyResourcePassword(
  assignmentId: string,
  deps: { db?: SupabaseClient; fetchPassword?: (resourceId: string) => Promise<string | null> } = {}
): Promise<RevealResult> {
  const supabase = deps.db ?? createClient();
  const { data, error } = await supabase.rpc("reveal_resource_assignment", { p_assignment: assignmentId });
  if (error) throw new Error(`reveal_resource_assignment: ${error.message}`);
  const rows = (data ?? []) as { airtable_resource_id: string; resource_label: string }[];
  const row = rows[0];
  if (!row) return { ok: false, reason: "refused" };

  let password: string | null;
  try {
    password = await (deps.fetchPassword ?? fetchResourcePassword)(row.airtable_resource_id);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  return password ? { ok: true, password } : { ok: false, reason: "empty" };
}
