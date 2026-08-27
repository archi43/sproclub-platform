import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCommandes, fetchSoutenanceCommandeMap, AirtableNotConfiguredError } from "@/lib/sync/airtable-source";
import { syncCommandes } from "@/lib/sync/run";
import { fetchFilloutSubmissions } from "@/lib/sync/fillout-source";
import { syncFillout } from "@/lib/sync/fillout";
import { pushCoachingReports } from "@/lib/sync/airtable-writeback";
import { logOpsEvent } from "@/lib/data/ops";

/**
 * Pipeline de synchronisation Airtable → Postgres (+ Fillout, + write-back).
 *
 * Extrait de la route cron (INC-25) pour que **deux appelants** partagent
 * exactement le même comportement : le cron, et le déclenchement manuel depuis
 * l'écran Exploitation. Dupliquer cette séquence aurait garanti qu'elles
 * divergent.
 *
 * Le client service-role est **injecté**, jamais construit ici : c'est
 * l'appelant qui doit avoir prouvé son droit d'agir (secret de cron, ou garde
 * de rôle pour l'action manuelle).
 */

export interface SyncOutcome {
  ok: boolean;
  org: string;
  /** Statistiques du pull Commandes, ou `undefined` si le pull a échoué. */
  stats?: unknown;
  /** Résultat du pull Fillout — non fatal : le pull Commandes prime. */
  fillout?: unknown;
  /** Résultat du write-back des comptes rendus — non fatal lui aussi. */
  writeback?: unknown;
  error?: string;
  /** `true` quand l'échec vient d'une configuration absente, pas d'une panne. */
  notConfigured?: boolean;
}

export async function runAirtableSync(
  admin: SupabaseClient,
  orgId: string,
  slug: string,
  trigger: "cron" | "manuel" = "cron"
): Promise<SyncOutcome> {
  const source = `${trigger === "manuel" ? "manuel" : "cron"}.sync`;
  try {
    const commandes = await fetchCommandes();
    const stats = await syncCommandes(admin, orgId, commandes);

    // Fillout → coaching_reports. Non fatal : une panne côté formulaires ne doit
    // pas invalider le pull des Commandes, qui est la source de vérité.
    let fillout: unknown = { skipped: "non configuré" };
    try {
      const submissions = await fetchFilloutSubmissions();
      if (submissions.length > 0) {
        // Map Soutenance → Commande (au mieux) : résout les formulaires dont le
        // sélecteur vise la table Soutenances plutôt que la Commande.
        let soutenanceMap = new Map<string, string>();
        try {
          soutenanceMap = await fetchSoutenanceCommandeMap();
        } catch (err) {
          await logOpsEvent({
            orgId, level: "warn", source,
            message: "Map Soutenance→Commande indisponible (jointure partielle)",
            detail: err instanceof Error ? err.message : "soutenance map failed",
          });
        }
        fillout = await syncFillout(admin, orgId, submissions, soutenanceMap);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "fillout sync failed";
      fillout = { error: message };
      await logOpsEvent({ orgId, level: "error", source, message: "Échec du pull Fillout", detail: message });
    }

    // Write-back des comptes rendus. Inactif tant qu'`AIRTABLE_WRITEBACK_ENABLED`
    // n'est pas posé avec un token en écriture. Non fatal.
    let writeback: unknown;
    try {
      writeback = await pushCoachingReports(admin, orgId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "writeback failed";
      writeback = { error: message };
      await logOpsEvent({ orgId, level: "error", source, message: "Échec du write-back Airtable", detail: message });
    }

    return { ok: true, org: slug, stats, fillout, writeback };
  } catch (err) {
    if (err instanceof AirtableNotConfiguredError) {
      return { ok: false, org: slug, error: err.message, notConfigured: true };
    }
    const message = err instanceof Error ? err.message : "sync failed";
    // Trace de l'échec dans les deux journaux, au mieux.
    await admin.from("sync_log").insert({
      entity: "commandes_formation",
      direction: "airtable_to_pg",
      status: "error",
      detail: message,
    });
    await logOpsEvent({ orgId, level: "error", source, message: "Échec de la synchronisation Airtable", detail: message });
    return { ok: false, org: slug, error: message };
  }
}
