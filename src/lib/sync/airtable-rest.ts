import "server-only";

/**
 * Accès REST bas niveau à Airtable, en lecture : configuration et pagination.
 *
 * Extrait au moment d'INC-29, quand une **deuxième** source de lecture est
 * apparue (Contacts et Habilitations, en plus des Commandes). Les deux
 * partagent la même boucle de pagination et la même détection de credential
 * manquant : la dupliquer aurait garanti qu'elles divergent, exactement le
 * raisonnement qui a fait extraire `sync/pipeline.ts` en INC-25.
 *
 * Reste volontairement sans SDK : une dépendance de plus pour trois appels
 * `fetch` ne se justifie pas.
 */

export class AirtableNotConfiguredError extends Error {
  constructor() {
    super("Airtable source is not configured (missing AIRTABLE_API_KEY / AIRTABLE_BASE_ID).");
    this.name = "AirtableNotConfiguredError";
  }
}

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

interface AirtablePage {
  records: AirtableRecord[];
  offset?: string;
}

interface AirtableConfig {
  apiKey: string;
  baseId: string;
}

/** Credentials, ou `AirtableNotConfiguredError` — jamais un appel à vide. */
export function airtableConfig(): AirtableConfig {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) throw new AirtableNotConfiguredError();
  return { apiKey, baseId };
}

export interface FetchOptions {
  /** Champs demandés : payload réduit, et contrat explicite avec la source. */
  fields: string[];
  /**
   * Filtre évalué **côté Airtable**. Sur une table de près de mille lignes,
   * filtrer à la source divise le nombre de pages, donc le nombre d'appels : la
   * limite dure est de 5 requêtes par seconde et par base, partagée avec les
   * automatisations du back office.
   */
  filterByFormula?: string;
}

/** Tous les enregistrements d'une table, pagination comprise (100 par page). */
export async function fetchAllRecords(
  tableId: string,
  options: FetchOptions
): Promise<AirtableRecord[]> {
  const { apiKey, baseId } = airtableConfig();
  const base = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`;
  const query = options.fields
    .map((f) => `fields%5B%5D=${encodeURIComponent(f)}`)
    .join("&");
  const filter = options.filterByFormula
    ? `&filterByFormula=${encodeURIComponent(options.filterByFormula)}`
    : "";

  const out: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const url = `${base}?pageSize=100&${query}${filter}${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      throw new Error(`Airtable fetch failed (${tableId}): ${res.status} ${await res.text()}`);
    }
    const page = (await res.json()) as AirtablePage;
    for (const r of page.records) out.push({ id: r.id, fields: r.fields });
    offset = page.offset;
  } while (offset);

  return out;
}

/** Premier recordID d'un champ de liens, ou `null`. */
export function firstLinkedId(value: unknown): string | null {
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

/** Champ texte exploitable, ou `null` (une chaîne vide n'est pas une valeur). */
export function textField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
