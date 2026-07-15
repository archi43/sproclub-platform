import "server-only";
import { SRC, type SourceRecord } from "@/lib/sync/mapping";

/**
 * Read-only Airtable source for the sync. Uses the REST API directly (no SDK
 * dependency) and requests only the mapped fields to keep payloads small.
 * NEVER writes to Airtable — INC-1 treats it as a read-only system of record.
 *
 * Env: AIRTABLE_API_KEY (scoped read-only), AIRTABLE_BASE_ID, and optionally
 * AIRTABLE_COMMANDES_TABLE_ID (defaults to the SproCLUB "Commandes Formation").
 */
export class AirtableNotConfiguredError extends Error {
  constructor() {
    super("Airtable source is not configured (missing AIRTABLE_API_KEY / AIRTABLE_BASE_ID).");
    this.name = "AirtableNotConfiguredError";
  }
}

interface AirtablePage {
  records: { id: string; fields: Record<string, unknown> }[];
  offset?: string;
}

/** Fetch every "Commandes Formation" record (paginated), mapped fields only. */
export async function fetchCommandes(): Promise<SourceRecord[]> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) throw new AirtableNotConfiguredError();
  const tableId = process.env.AIRTABLE_COMMANDES_TABLE_ID ?? "tblXkTdqNwqw9Vkgr";

  const base = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`;
  const fieldsQuery = Object.values(SRC)
    .map((f) => `fields%5B%5D=${encodeURIComponent(f)}`)
    .join("&");

  const out: SourceRecord[] = [];
  let offset: string | undefined;
  do {
    const url = `${base}?pageSize=100&${fieldsQuery}${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`Airtable fetch failed: ${res.status} ${await res.text()}`);
    const page = (await res.json()) as AirtablePage;
    for (const r of page.records) out.push({ id: r.id, fields: r.fields });
    offset = page.offset;
  } while (offset);

  return out;
}

/**
 * Soutenances formation → Commande (INC-16). Les formulaires Fillout
 * d'évaluation/soutenance désignent l'apprenant via un RecordPicker
 * « Soutenance » : cette map (recordID soutenance → recordID Commande, champ
 * « Sales Orders-header ») permet à la sync Fillout de résoudre le dossier.
 * Lecture seule, paginée, un seul champ demandé.
 */
export async function fetchSoutenanceCommandeMap(): Promise<Map<string, string>> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) throw new AirtableNotConfiguredError();
  const tableId = process.env.AIRTABLE_SOUTENANCES_TABLE_ID ?? "tblWV8UbwgJ5NgnuW";
  const field = "Sales Orders-header";

  const base = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`;
  const map = new Map<string, string>();
  let offset: string | undefined;
  do {
    const url = `${base}?pageSize=100&fields%5B%5D=${encodeURIComponent(field)}${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`Airtable soutenances fetch failed: ${res.status}`);
    const page = (await res.json()) as AirtablePage;
    for (const r of page.records) {
      const linked = r.fields[field];
      if (Array.isArray(linked) && typeof linked[0] === "string") map.set(r.id, linked[0]);
    }
    offset = page.offset;
  } while (offset);
  return map;
}
