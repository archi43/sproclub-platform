import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { StaffTalentStatus } from "@/lib/talent-rules";

/**
 * Vivier de talents (INC-17), RLS-enforced.
 *
 * - Les PARTENAIRES ne lisent que la vue `talent_pool` (0025) : consentis
 *   uniquement, synthèse chiffrée, org courante — aucune policy ne leur ouvre
 *   les tables sous-jacentes.
 * - L'APPRENANT gère sa ligne `talent_profiles` (consentement + déclaratif)
 *   via sa policy ; le statut vivier (`staff_status`) est verrouillé par
 *   trigger côté base.
 * - Le STAFF gère les entreprises partenaires et le statut vivier.
 */

export interface TalentCandidate {
  learnerId: string;
  firstName: string | null;
  lastName: string | null;
  program: string | null;
  specialty: string | null;
  enrollmentStatus: string | null;
  progress: number | null;
  projectsValidated: number | null;
  projectsRequired: number | null;
  lateDays: number | null;
  startDate: string | null;
  endDate: string | null;
  juryAvgScore: number | null;
  juryValidatedCount: number;
  lastJuryValidationAt: string | null;
  staffStatus: StaffTalentStatus | null;
  availableFrom: string | null;
  contractSought: string | null;
  mobility: string | null;
}

export interface TalentProfile {
  id: string;
  learnerId: string;
  consentedAt: string | null;
  revokedAt: string | null;
  availableFrom: string | null;
  contractSought: string | null;
  mobility: string | null;
  staffStatus: StaffTalentStatus | null;
}

export interface PartnerCompany {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
}

/** Le vivier visible (vue 0025) — partenaires et staff, RLS/vue comme garde.
 *  Chaque consultation est journalisée (accountability RGPD : un tiers regarde
 *  des données nominatives). Best-effort : l'échec du journal ne bloque pas. */
export async function listTalentPool(orgId: string): Promise<TalentCandidate[]> {
  const supabase = createClient();
  try {
    await supabase.rpc("log_access", {
      p_action: "talent_pool.view",
      p_subject_type: "talent_pool",
      p_subject_id: null,
      p_detail: null,
    });
  } catch {
    // journal best-effort
  }
  const { data, error } = await supabase
    .from("talent_pool")
    .select(
      "learner_id, first_name, last_name, program, specialty, enrollment_status, progress, projects_validated, projects_required, late_days, start_date, end_date, jury_avg_score, jury_validated_count, last_jury_validation_at, staff_status, available_from, contract_sought, mobility"
    )
    .eq("org_id", orgId)
    .order("last_name", { ascending: true });
  if (error) throw new Error(`Failed to load talent pool: ${error.message}`);
  return (data ?? []).map((r) => ({
    learnerId: r.learner_id as string,
    firstName: r.first_name as string | null,
    lastName: r.last_name as string | null,
    program: r.program as string | null,
    specialty: r.specialty as string | null,
    enrollmentStatus: r.enrollment_status as string | null,
    progress: r.progress as number | null,
    projectsValidated: r.projects_validated as number | null,
    projectsRequired: r.projects_required as number | null,
    lateDays: r.late_days as number | null,
    startDate: r.start_date as string | null,
    endDate: r.end_date as string | null,
    juryAvgScore: r.jury_avg_score as number | null,
    juryValidatedCount: (r.jury_validated_count as number | null) ?? 0,
    lastJuryValidationAt: r.last_jury_validation_at as string | null,
    staffStatus: r.staff_status as StaffTalentStatus | null,
    availableFrom: r.available_from as string | null,
    contractSought: r.contract_sought as string | null,
    mobility: r.mobility as string | null,
  }));
}

/** La société de rattachement du partenaire connecté (policy partner_read). */
export async function getMyPartnerCompany(orgId: string): Promise<PartnerCompany | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("partner_companies")
    .select("id, name, active, created_at")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load partner company: ${error.message}`);
  return data
    ? { id: data.id as string, name: data.name as string, active: data.active as boolean, createdAt: data.created_at as string }
    : null;
}

// -----------------------------------------------------------------------------
// Apprenant : consentement + disponibilité déclarative (policy student_manage)
// -----------------------------------------------------------------------------

/** Le profil vivier de l'apprenant connecté (null si jamais créé). */
export async function getMyTalentProfile(orgId: string): Promise<TalentProfile | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("talent_profiles")
    .select("id, learner_id, consented_at, revoked_at, available_from, contract_sought, mobility, staff_status")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load talent profile: ${error.message}`);
  return data ? mapProfile(data) : null;
}

function mapProfile(r: Record<string, unknown>): TalentProfile {
  return {
    id: r.id as string,
    learnerId: r.learner_id as string,
    consentedAt: r.consented_at as string | null,
    revokedAt: r.revoked_at as string | null,
    availableFrom: r.available_from as string | null,
    contractSought: r.contract_sought as string | null,
    mobility: r.mobility as string | null,
    staffStatus: r.staff_status as StaffTalentStatus | null,
  };
}

/** L'id learners_ro de l'apprenant connecté (nécessaire au premier insert). */
async function getMyLearnerId(orgId: string): Promise<string> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email?.toLowerCase();
  if (!email) throw new Error("Utilisateur non authentifié.");
  const { data, error } = await supabase
    .from("learners_ro")
    .select("id")
    .eq("org_id", orgId)
    .eq("email", email)
    .maybeSingle();
  if (error || !data) throw new Error("Dossier apprenant introuvable pour ce compte.");
  return data.id as string;
}

/** Consentir / révoquer + mettre à jour la dispo déclarative (upsert RLS). */
export async function saveMyTalentProfile(
  orgId: string,
  input: { consent: boolean; availableFrom: string | null; contractSought: string | null; mobility: string | null }
): Promise<void> {
  const supabase = createClient();
  const learnerId = await getMyLearnerId(orgId);
  const existing = await getMyTalentProfile(orgId);

  const now = new Date().toISOString();
  const consentFields = input.consent
    ? { consented_at: existing?.consentedAt && !existing.revokedAt ? existing.consentedAt : now, revoked_at: null }
    : { revoked_at: existing?.consentedAt ? now : null };

  const { error } = await supabase.from("talent_profiles").upsert(
    {
      org_id: orgId,
      learner_id: learnerId,
      available_from: input.availableFrom,
      contract_sought: input.contractSought,
      mobility: input.mobility,
      updated_at: now,
      ...consentFields,
    },
    { onConflict: "org_id,learner_id" }
  );
  if (error) throw new Error(`Failed to save talent profile: ${error.message}`);
}

// -----------------------------------------------------------------------------
// Staff : statut vivier + entreprises partenaires
// -----------------------------------------------------------------------------

/** La coordination pose le statut vivier d'un apprenant (upsert RLS staff). */
export async function setStaffTalentStatus(
  orgId: string,
  learnerId: string,
  status: StaffTalentStatus | null
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("talent_profiles").upsert(
    { org_id: orgId, learner_id: learnerId, staff_status: status, updated_at: new Date().toISOString() },
    { onConflict: "org_id,learner_id" }
  );
  if (error) throw new Error(`Failed to set talent status: ${error.message}`);
}

/** Profil vivier d'un apprenant, lecture staff (fiche apprenant). */
export async function getTalentProfileForLearner(orgId: string, learnerId: string): Promise<TalentProfile | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("talent_profiles")
    .select("id, learner_id, consented_at, revoked_at, available_from, contract_sought, mobility, staff_status")
    .eq("org_id", orgId)
    .eq("learner_id", learnerId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load talent profile: ${error.message}`);
  return data ? mapProfile(data) : null;
}

export async function listPartnerCompanies(orgId: string): Promise<PartnerCompany[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("partner_companies")
    .select("id, name, active, created_at")
    .eq("org_id", orgId)
    .order("name");
  if (error) throw new Error(`Failed to load partner companies: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    active: r.active as boolean,
    createdAt: r.created_at as string,
  }));
}

export async function createPartnerCompany(orgId: string, name: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("partner_companies").insert({ org_id: orgId, name: name.trim() });
  if (error) throw new Error(`Failed to create partner company: ${error.message}`);
}
