import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchDesiredAccess } from "@/lib/sync/access-source";
import {
  decideAccessSync,
  summarizePlan,
  type AccessAction,
  type CurrentMembership,
} from "@/lib/access-rules";
import { inviteMember } from "@/lib/members/provision";
import { logOpsEvent } from "@/lib/data/ops";

/**
 * Rapprochement des accès (INC-29) : Airtable décide, la plateforme s'aligne.
 *
 * La décision est prise par `decideAccessSync`, pure et testée hors base. Ce
 * module ne fait que la lire et l'appliquer, puis journaliser ce qu'il a fait.
 * La séparation est délibérée : c'est la décision, pas l'écriture, qu'il faudra
 * pouvoir rejouer devant une contestation d'accès.
 *
 * Tourne sous **service-role**, parce qu'aucun humain n'agit : créer un
 * utilisateur d'authentification et écrire un journal infalsifiable sont
 * précisément les deux choses que la RLS ne peut pas faire. L'appelant doit donc
 * avoir prouvé son droit en amont (secret de cron, ou garde de rôle).
 */

export interface AccessSyncResult {
  /** Décompte par type d'action : create, grant, reactivate, deactivate, skip. */
  summary: Record<string, number>;
  /** Échecs d'application, action par action — jamais avalés. */
  failures: { email: string; role: string; error: string }[];
}

export async function syncAccess(admin: SupabaseClient, orgId: string): Promise<AccessSyncResult> {
  const [desired, current, erasedEmails] = await Promise.all([
    fetchDesiredAccess(),
    loadCurrentMemberships(admin, orgId),
    loadErasedEmails(admin, orgId),
  ]);

  const plan = decideAccessSync(desired, current, { erasedEmails });
  const failures: AccessSyncResult["failures"] = [];

  for (const action of plan.actions) {
    try {
      await applyAction(admin, orgId, action);
    } catch (err) {
      const message = err instanceof Error ? err.message : "action failed";
      failures.push({ email: action.email, role: action.role, error: message });
    }
  }

  const summary = summarizePlan(plan);
  // Un passage sans effet reste silencieux : à 96 passages par jour, journaliser
  // l'inaction noierait les décisions réelles.
  const touched = summary.create + summary.grant + summary.reactivate + summary.deactivate;
  if (touched > 0 || failures.length > 0 || summary.skip > 0) {
    await logOpsEvent({
      orgId,
      level: failures.length > 0 ? "error" : "info",
      source: "sync.access",
      message: `Accès rapprochés depuis Airtable : ${touched} mouvement(s)`,
      detail: JSON.stringify({ ...summary, failures: failures.length }),
    });
  }

  return { summary, failures };
}

/** État courant, service-role : on doit voir aussi les lignes désactivées. */
async function loadCurrentMemberships(
  admin: SupabaseClient,
  orgId: string
): Promise<CurrentMembership[]> {
  const { data, error } = await admin
    .from("memberships")
    // Embed désambiguïsé : `memberships` porte trois FK vers `profiles` depuis
    // 0012, et un embed ambigu casse en production (déjà vécu).
    .select("profile_id, role, source, airtable_habilitation_id, deactivated_at, profile:profiles!memberships_profile_id_fkey(email)")
    .eq("org_id", orgId);
  if (error) throw new Error(`Lecture des memberships impossible : ${error.message}`);

  type Row = {
    profile_id: string;
    role: string;
    source: string | null;
    airtable_habilitation_id: string | null;
    deactivated_at: string | null;
    profile: { email: string } | null;
  };

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    profileId: r.profile_id,
    email: r.profile?.email ?? "",
    role: r.role,
    // Une ligne antérieure à 0031 n'a pas de provenance : la traiter comme
    // manuelle est le défaut sûr (hors périmètre, donc jamais coupée).
    source: r.source ?? "manual",
    habilitationId: r.airtable_habilitation_id,
    deactivated: r.deactivated_at !== null,
  }));
}

/**
 * Liste de suppression RGPD (INC-11). Un échec de lecture est **fatal** ici, à la
 * différence du reste du rapprochement : continuer sans elle reviendrait à
 * risquer de recréer le compte d'une personne effacée, ce qui annulerait un droit
 * exercé. Mieux vaut ne rien faire et réessayer dans 15 minutes.
 */
async function loadErasedEmails(admin: SupabaseClient, orgId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("data_erasures")
    .select("learner_email")
    .eq("org_id", orgId);
  if (error) throw new Error(`Liste de suppression illisible : ${error.message}`);
  return ((data ?? []) as { learner_email: string }[]).map((r) => r.learner_email);
}

async function applyAction(
  admin: SupabaseClient,
  orgId: string,
  action: AccessAction
): Promise<void> {
  switch (action.kind) {
    case "create":
      // Le provisioning sait déjà retrouver-ou-créer le compte d'authentification
      // et compenser s'il échoue à mi-chemin (INC-10). Pas d'acteur humain ici.
      await inviteMember({
        orgId,
        email: action.email,
        fullName: action.fullName,
        role: action.role,
        invitedBy: null,
        source: "airtable",
        airtableHabilitationId: action.habilitationId,
      });
      break;

    case "grant": {
      const { error } = await admin.from("memberships").insert({
        org_id: orgId,
        profile_id: action.profileId,
        role: action.role,
        invited_by: null,
        source: "airtable",
        airtable_habilitation_id: action.habilitationId,
      });
      if (error) throw new Error(error.message);
      break;
    }

    case "reactivate": {
      const { error } = await admin
        .from("memberships")
        .update({ deactivated_at: null, deactivated_by: null })
        .eq("org_id", orgId)
        .eq("profile_id", action.profileId)
        .eq("role", action.role);
      if (error) throw new Error(error.message);
      break;
    }

    case "deactivate": {
      // `deactivated_by` reste null : personne n'a pris cette décision à la main,
      // c'est l'expiration de l'habilitation qui l'a prise. Le journal ci-dessous
      // porte le motif.
      const { error } = await admin
        .from("memberships")
        .update({ deactivated_at: new Date().toISOString(), deactivated_by: null })
        .eq("org_id", orgId)
        .eq("profile_id", action.profileId)
        .eq("role", action.role)
        .is("deactivated_at", null);
      if (error) throw new Error(error.message);
      break;
    }

    case "skip":
      // Rien à écrire dans `memberships`, mais le motif part au journal.
      break;
  }

  // Au mieux, et surtout APRÈS l'écriture : un journal indisponible ne doit pas
  // faire compter en échec une action déjà appliquée, sinon le passage suivant
  // la rejouerait.
  try {
    await logAccessDecision(admin, orgId, action);
  } catch {
    // Volontairement silencieux ici : l'échec global du passage est déjà porté
    // par `ops_events` dans `syncAccess`.
  }
}

/**
 * Trace de la décision. Écrite par le service-role seul, lue par le staff
 * (policy de 0031) : une trace que son sujet peut réécrire ne vaut rien.
 */
async function logAccessDecision(
  admin: SupabaseClient,
  orgId: string,
  action: AccessAction
): Promise<void> {
  await admin.from("access_sync_log").insert({
    org_id: orgId,
    action: action.kind,
    email: action.email,
    role: action.role,
    airtable_habilitation_id: action.habilitationId,
    reason: action.kind === "skip" ? action.reason : null,
  });
}
