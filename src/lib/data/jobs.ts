import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { JobStatus } from "@/lib/job-rules";

/**
 * Jobboard (INC-18), RLS-enforced.
 *
 * - Le PARTENAIRE gère les offres de sa société (policy job_offers_partner_manage) ;
 *   la publication reste à la coordination (trigger protect_job_offer_moderation).
 * - L'APPRENANT lit les offres publiées et gère son intérêt (un clic).
 * - Le STAFF modère (publier / rejeter) et suit les intérêts.
 * - Les candidats intéressés d'une offre = vue job_offer_candidates (consentants
 *   au vivier, synthèse chiffrée — mêmes garanties qu'INC-17).
 */

export interface JobOffer {
  id: string;
  partnerCompanyId: string;
  companyName: string | null;
  title: string;
  description: string;
  contractType: string | null;
  location: string | null;
  remote: string | null;
  status: JobStatus;
  moderationNote: string | null;
  publishedAt: string | null;
  createdAt: string;
  interestCount: number;
}

export interface JobCandidate {
  jobOfferId: string;
  learnerId: string;
  firstName: string | null;
  lastName: string | null;
  interestedAt: string;
  program: string | null;
  specialty: string | null;
  progress: number | null;
  projectsValidated: number | null;
  projectsRequired: number | null;
  juryAvgScore: number | null;
  juryValidatedCount: number;
  availableFrom: string | null;
  contractSought: string | null;
  mobility: string | null;
}

interface RawOffer {
  id: string;
  partner_company_id: string;
  title: string;
  description: string;
  contract_type: string | null;
  location: string | null;
  remote: string | null;
  status: JobStatus;
  moderation_note: string | null;
  published_at: string | null;
  created_at: string;
  company?: { name: string | null } | null;
  interests?: { count: number }[];
}

const OFFER_COLUMNS =
  "id, partner_company_id, title, description, contract_type, location, remote, status, moderation_note, published_at, created_at, company:partner_companies!job_offers_partner_company_id_fkey(name), interests:job_interests(count)";

function mapOffer(r: RawOffer): JobOffer {
  return {
    id: r.id,
    partnerCompanyId: r.partner_company_id,
    companyName: r.company?.name ?? null,
    title: r.title,
    description: r.description,
    contractType: r.contract_type,
    location: r.location,
    remote: r.remote,
    status: r.status,
    moderationNote: r.moderation_note,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    interestCount: r.interests?.[0]?.count ?? 0,
  };
}

// -----------------------------------------------------------------------------
// Lectures par rôle (RLS filtre les lignes ; ce module ne widen jamais)
// -----------------------------------------------------------------------------

/** Offres de la société du partenaire connecté (tous statuts, policy partner). */
export async function listMyCompanyOffers(orgId: string): Promise<JobOffer[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("job_offers")
    .select(OFFER_COLUMNS)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load offers: ${error.message}`);
  return (data as unknown as RawOffer[]).map(mapOffer);
}

/** Offres publiées visibles de l'apprenant (RLS : status='published'). */
export async function listPublishedOffers(orgId: string): Promise<JobOffer[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("job_offers")
    .select(OFFER_COLUMNS)
    .eq("org_id", orgId)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) throw new Error(`Failed to load offers: ${error.message}`);
  return (data as unknown as RawOffer[]).map(mapOffer);
}

/** Toutes les offres de l'org (staff — modération). */
export async function listAllOffers(orgId: string): Promise<JobOffer[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("job_offers")
    .select(OFFER_COLUMNS)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load offers: ${error.message}`);
  return (data as unknown as RawOffer[]).map(mapOffer);
}

/** Les ids d'offres pour lesquelles l'apprenant connecté a marqué son intérêt. */
export async function listMyInterestOfferIds(orgId: string): Promise<Set<string>> {
  const supabase = createClient();
  const { data, error } = await supabase.from("job_interests").select("job_offer_id").eq("org_id", orgId);
  if (error) throw new Error(`Failed to load interests: ${error.message}`);
  return new Set((data ?? []).map((r) => r.job_offer_id as string));
}

/** Candidats intéressés par une offre (vue 0026 : consentants, synthèse).
 *  La vue est déjà bornée à l'org courante et à la société propriétaire de
 *  l'offre (WHERE côté 0026) ; le filtre par offer id suffit ici. */
export async function listOfferCandidates(jobOfferId: string): Promise<JobCandidate[]> {
  const supabase = createClient();
  // Accountability RGPD : un tiers consulte des données nominatives d'apprenants
  // (best-effort, comme listTalentPool — l'échec du journal ne bloque pas).
  try {
    await supabase.rpc("log_access", {
      p_action: "job_offer_candidates.view",
      p_subject_type: "job_offer",
      p_subject_id: jobOfferId,
      p_detail: null,
    });
  } catch {
    // journal best-effort
  }
  const { data, error } = await supabase
    .from("job_offer_candidates")
    .select(
      "job_offer_id, learner_id, first_name, last_name, interested_at, program, specialty, progress, projects_validated, projects_required, jury_avg_score, jury_validated_count, available_from, contract_sought, mobility"
    )
    .eq("job_offer_id", jobOfferId)
    .order("interested_at", { ascending: false });
  if (error) throw new Error(`Failed to load candidates: ${error.message}`);
  return (data ?? []).map((r) => ({
    jobOfferId: r.job_offer_id as string,
    learnerId: r.learner_id as string,
    firstName: r.first_name as string | null,
    lastName: r.last_name as string | null,
    interestedAt: r.interested_at as string,
    program: r.program as string | null,
    specialty: r.specialty as string | null,
    progress: r.progress as number | null,
    projectsValidated: r.projects_validated as number | null,
    projectsRequired: r.projects_required as number | null,
    juryAvgScore: r.jury_avg_score as number | null,
    juryValidatedCount: (r.jury_validated_count as number | null) ?? 0,
    availableFrom: r.available_from as string | null,
    contractSought: r.contract_sought as string | null,
    mobility: r.mobility as string | null,
  }));
}

// -----------------------------------------------------------------------------
// Écritures (RLS + trigger de modération sont les garde-fous serveur)
// -----------------------------------------------------------------------------

export interface OfferInput {
  title: string;
  description: string;
  contractType: string | null;
  location: string | null;
  remote: string | null;
}

/** Le partenaire crée une offre (soumise en modération : status pending). */
export async function createOffer(orgId: string, partnerCompanyId: string, input: OfferInput): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("job_offers").insert({
    org_id: orgId,
    partner_company_id: partnerCompanyId,
    title: input.title,
    description: input.description,
    contract_type: input.contractType,
    location: input.location,
    remote: input.remote,
  });
  if (error) throw new Error(`Failed to create offer: ${error.message}`);
}

/** Changer le statut d'une offre. La RLS + le trigger valident QUI peut quoi ;
 *  on pose aussi published_at/moderated_by côté staff pour la traçabilité. */
export async function setOfferStatus(
  orgId: string,
  offerId: string,
  status: JobStatus,
  opts: { moderatedBy?: string | null; note?: string | null } = {}
): Promise<void> {
  const supabase = createClient();
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (opts.moderatedBy !== undefined) patch.moderated_by = opts.moderatedBy;
  if (status === "published") patch.published_at = new Date().toISOString();
  if (opts.note !== undefined) patch.moderation_note = opts.note;
  const { error } = await supabase.from("job_offers").update(patch).eq("id", offerId).eq("org_id", orgId);
  if (error) throw new Error(`Failed to update offer: ${error.message}`);
}

/** L'apprenant marque (ou retire) son intérêt pour une offre publiée. */
export async function setMyInterest(orgId: string, learnerId: string, jobOfferId: string, interested: boolean): Promise<void> {
  const supabase = createClient();
  if (interested) {
    const { error } = await supabase
      .from("job_interests")
      .upsert({ org_id: orgId, job_offer_id: jobOfferId, learner_id: learnerId }, { onConflict: "job_offer_id,learner_id", ignoreDuplicates: true });
    if (error) throw new Error(`Failed to set interest: ${error.message}`);
  } else {
    const { error } = await supabase.from("job_interests").delete().eq("org_id", orgId).eq("job_offer_id", jobOfferId).eq("learner_id", learnerId);
    if (error) throw new Error(`Failed to remove interest: ${error.message}`);
  }
}

/** L'id learners_ro de l'apprenant connecté (pour poser un intérêt). */
export async function getMyLearnerId(orgId: string): Promise<string | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email?.toLowerCase();
  if (!email) return null;
  const { data } = await supabase.from("learners_ro").select("id").eq("org_id", orgId).eq("email", email).maybeSingle();
  return (data?.id as string) ?? null;
}

// -----------------------------------------------------------------------------
// Besoins de formation (signal B2B partenaire → coordination, INC-18)
// -----------------------------------------------------------------------------

export type TrainingNeedStatus = "open" | "reviewed" | "closed";

export interface TrainingNeed {
  id: string;
  partnerCompanyId: string;
  companyName: string | null;
  title: string;
  description: string | null;
  headcount: number | null;
  timeframe: string | null;
  status: TrainingNeedStatus;
  createdAt: string;
}

const NEED_COLUMNS =
  "id, partner_company_id, title, description, headcount, timeframe, status, created_at, company:partner_companies!partner_training_needs_partner_company_id_fkey(name)";

function mapNeed(r: Record<string, unknown>): TrainingNeed {
  const company = r.company as { name: string | null } | null;
  return {
    id: r.id as string,
    partnerCompanyId: r.partner_company_id as string,
    companyName: company?.name ?? null,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    headcount: (r.headcount as number | null) ?? null,
    timeframe: (r.timeframe as string | null) ?? null,
    status: r.status as TrainingNeedStatus,
    createdAt: r.created_at as string,
  };
}

/** Besoins de la société du partenaire connecté (RLS partner_manage). */
export async function listMyTrainingNeeds(orgId: string): Promise<TrainingNeed[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("partner_training_needs")
    .select(NEED_COLUMNS)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load training needs: ${error.message}`);
  return (data ?? []).map((r) => mapNeed(r as Record<string, unknown>));
}

/** Tous les besoins de l'org (staff — pilotage de l'offre de formation). */
export async function listAllTrainingNeeds(orgId: string): Promise<TrainingNeed[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("partner_training_needs")
    .select(NEED_COLUMNS)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load training needs: ${error.message}`);
  return (data ?? []).map((r) => mapNeed(r as Record<string, unknown>));
}

export interface TrainingNeedInput {
  title: string;
  description: string | null;
  headcount: number | null;
  timeframe: string | null;
}

/** Le partenaire exprime un besoin de formation (statut open). */
export async function createTrainingNeed(orgId: string, partnerCompanyId: string, input: TrainingNeedInput): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("partner_training_needs").insert({
    org_id: orgId,
    partner_company_id: partnerCompanyId,
    title: input.title,
    description: input.description,
    headcount: input.headcount,
    timeframe: input.timeframe,
  });
  if (error) throw new Error(`Failed to create training need: ${error.message}`);
}

/** La coordination met à jour le statut d'un besoin (open/reviewed/closed). */
export async function setTrainingNeedStatus(orgId: string, needId: string, status: TrainingNeedStatus): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("partner_training_needs")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", needId)
    .eq("org_id", orgId);
  if (error) throw new Error(`Failed to update training need: ${error.message}`);
}
