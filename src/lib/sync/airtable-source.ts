import "server-only";
import { SRC, type SourceRecord } from "@/lib/sync/mapping";
import { fetchAllRecords, firstLinkedId, AirtableNotConfiguredError } from "@/lib/sync/airtable-rest";

/**
 * Read-only Airtable source for the sync. Uses the REST API directly (no SDK
 * dependency) and requests only the mapped fields to keep payloads small.
 *
 * Depuis INC-29, la pagination et la détection de credential manquant vivent
 * dans `sync/airtable-rest.ts`, partagées avec la source des accès.
 *
 * Env: AIRTABLE_API_KEY, AIRTABLE_BASE_ID, et éventuellement
 * AIRTABLE_COMMANDES_TABLE_ID (défaut : la table « Commandes Formation »).
 */

// Ré-exporté : plusieurs appelants attrapent cette erreur depuis ce module.
export { AirtableNotConfiguredError };

/** Fetch every "Commandes Formation" record (paginated), mapped fields only. */
export async function fetchCommandes(): Promise<SourceRecord[]> {
  const tableId = process.env.AIRTABLE_COMMANDES_TABLE_ID ?? "tblXkTdqNwqw9Vkgr";
  const records = await fetchAllRecords(tableId, { fields: Object.values(SRC) });
  return records.map((r) => ({ id: r.id, fields: r.fields }));
}

/**
 * Soutenances formation → Commande (INC-16). Les formulaires Fillout
 * d'évaluation/soutenance désignent l'apprenant via un RecordPicker
 * « Soutenance » : cette map (recordID soutenance → recordID Commande, champ
 * « Sales Orders-header ») permet à la sync Fillout de résoudre le dossier.
 * Lecture seule, paginée, un seul champ demandé.
 */
export async function fetchSoutenanceCommandeMap(): Promise<Map<string, string>> {
  const tableId = process.env.AIRTABLE_SOUTENANCES_TABLE_ID ?? "tblWV8UbwgJ5NgnuW";
  const field = "Sales Orders-header";
  const records = await fetchAllRecords(tableId, { fields: [field] });

  const map = new Map<string, string>();
  for (const r of records) {
    const linked = firstLinkedId(r.fields[field]);
    if (linked) map.set(r.id, linked);
  }
  return map;
}
