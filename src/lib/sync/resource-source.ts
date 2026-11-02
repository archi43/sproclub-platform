import "server-only";
import { fetchAllRecords, firstLinkedId, textField, type AirtableRecord } from "@/lib/sync/airtable-rest";
import {
  RESOURCE_SYNC_LOOKBACK_DAYS,
  type SourceAssignment,
  type SourceResource,
  type SourceResourceType,
} from "@/lib/resource-rules";

/**
 * Source des accès aux ressources (INC-30) : trois tables du back office.
 *
 * - **Affectation ressources** relie une commande à un ou plusieurs comptes,
 *   pour une période (`Start date` / `End Date`).
 * - **Ressources** porte l'identifiant de connexion et le type du compte. Elle
 *   porte aussi le **mot de passe**, qui n'est JAMAIS demandé par la
 *   synchronisation : la liste `fields` ci-dessous est le contrat, et le champ
 *   n'y figure pas. Il n'est lu qu'à la demande, par `fetchResourcePassword`.
 * - **Types de ressources** donne un libellé lisible au type (« Serveur SAP
 *   S/4HANA ») et sa catégorie.
 *
 * Le filtre de période est évalué côté Airtable : seules les affectations en
 * cours, à venir ou expirées depuis moins de `RESOURCE_SYNC_LOOKBACK_DAYS` jours
 * sont lues (une soixantaine aujourd'hui, sur un historique bien plus long).
 */

const ASSIGNMENTS_TABLE = process.env.AIRTABLE_RESOURCE_ASSIGNMENTS_TABLE_ID ?? "tbl4HdkKtMGS0PrbG";
const RESOURCES_TABLE = process.env.AIRTABLE_RESOURCES_TABLE_ID ?? "tblpv9215xOgaJxwx";
const RESOURCE_TYPES_TABLE = process.env.AIRTABLE_RESOURCE_TYPES_TABLE_ID ?? "tblRpc7xDB7pBP5qZ";

const AFF = { commande: "Commande de vente", resources: "Ressources", start: "Start date", end: "End Date" } as const;
const RES = { label: "Ressource", type: "Type de ressource", password: "Mot de passe" } as const;
const TYPE = { name: "Nom", category: "Catégorie" } as const;

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;
const RECORD_IDS_PER_REQUEST = 100;

const linkedIds = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/** Libellé d'un champ de sélection simple, renvoyé en chaîne ou en objet selon l'API. */
const selectName = (value: unknown): string | null => {
  if (typeof value === "string") return textField(value);
  if (value && typeof value === "object" && "name" in value) return textField((value as { name: unknown }).name);
  return null;
};

export interface ResourceSource {
  assignments: SourceAssignment[];
  resources: SourceResource[];
  types: SourceResourceType[];
}

export async function fetchResourceSource(): Promise<ResourceSource> {
  const window = `OR({${AFF.end}} = BLANK(), IS_AFTER({${AFF.end}}, DATEADD(TODAY(), -${RESOURCE_SYNC_LOOKBACK_DAYS + 1}, 'days')))`;
  const assignmentRecords = await fetchAllRecords(ASSIGNMENTS_TABLE, {
    fields: [AFF.commande, AFF.resources, AFF.start, AFF.end],
    filterByFormula: window,
  });
  const assignments: SourceAssignment[] = assignmentRecords.map((r) => ({
    recordId: r.id,
    commandeId: firstLinkedId(r.fields[AFF.commande]),
    resourceIds: linkedIds(r.fields[AFF.resources]),
    startsOn: textField(r.fields[AFF.start]),
    endsOn: textField(r.fields[AFF.end]),
  }));

  // Seuls les comptes effectivement affectés sont lus : pas de lecture du stock entier.
  const wanted = [...new Set(assignments.flatMap((a) => a.resourceIds))].filter((id) => RECORD_ID.test(id));
  // Par paquets : Airtable plafonne la longueur d'URL (16 ko), et chaque terme
  // `RECORD_ID() = '…'` en coûte une quarantaine une fois encodé.
  const resourceRecords: AirtableRecord[] = [];
  for (let i = 0; i < wanted.length; i += RECORD_IDS_PER_REQUEST) {
    const chunk = wanted.slice(i, i + RECORD_IDS_PER_REQUEST);
    resourceRecords.push(...await fetchAllRecords(RESOURCES_TABLE, {
      fields: [RES.label, RES.type],
      filterByFormula: `OR(${chunk.map((id) => `RECORD_ID() = '${id}'`).join(",")})`,
    }));
  }
  const resources: SourceResource[] = resourceRecords.map((r) => ({
    recordId: r.id,
    label: textField(r.fields[RES.label]),
    typeId: firstLinkedId(r.fields[RES.type]),
  }));

  const typeRecords = await fetchAllRecords(RESOURCE_TYPES_TABLE, { fields: [TYPE.name, TYPE.category] });
  const types: SourceResourceType[] = typeRecords.map((r) => ({
    recordId: r.id,
    name: textField(r.fields[TYPE.name]),
    category: selectName(r.fields[TYPE.category]),
  }));

  return { assignments, resources, types };
}

/**
 * Mot de passe d'un compte, lu à la demande. `null` si le champ est vide.
 *
 * L'appelant DOIT avoir vérifié avant l'appel que l'utilisateur est l'apprenant
 * propriétaire d'une affectation active de ce compte (`data/resources.ts`).
 * L'identifiant est validé avant d'entrer dans la formule Airtable : il vient de
 * notre base, mais une formule construite par concaténation ne se fie à rien.
 */
export async function fetchResourcePassword(resourceRecordId: string): Promise<string | null> {
  if (!RECORD_ID.test(resourceRecordId)) throw new Error("Identifiant de ressource invalide.");
  const records = await fetchAllRecords(RESOURCES_TABLE, {
    fields: [RES.password],
    filterByFormula: `RECORD_ID() = '${resourceRecordId}'`,
  });
  if (records.length === 0) return null;
  // Pas de trim : un mot de passe peut légitimement contenir des espaces.
  const value = records[0].fields[RES.password];
  return typeof value === "string" && value !== "" ? value : null;
}
