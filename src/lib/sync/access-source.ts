import "server-only";
import { fetchAllRecords, firstLinkedId, textField } from "@/lib/sync/airtable-rest";
import type { DesiredAccess } from "@/lib/access-rules";

/**
 * Source des accès (INC-29) : qui doit avoir un compte, avec quel rôle.
 *
 * Deux tables du back office, et une seule lecture de chacune :
 *
 * - **Habilitations** porte le rôle applicatif, une case Actif et une fenêtre
 *   Début/Fin. Sa formule `Rôle effectif` ne rend le rôle que si la fenêtre est
 *   ouverte aujourd'hui. On lit cette formule, **jamais** « Rôle applicatif » :
 *   mesuré sur la base réelle, 20 habilitations sur 123 sont marquées Actif mais
 *   hors fenêtre (12 à fin dépassée, 8 case décochée). S'appuyer sur le rôle brut
 *   ouvrirait donc 20 accès indus.
 * - **Contacts** porte l'identité. Sa formule `Accès interface` vaut 1 quand le
 *   contact a un e-mail, un statut Actif et au moins un rôle effectif : c'est la
 *   porte d'entrée, et elle écarte au passage les fiches « Doublon » et
 *   « Archivé ».
 *
 * Les deux filtres sont évalués **côté Airtable** : sur 966 contacts et 123
 * habilitations, cela ramène la lecture à 4 appels au lieu de 12, sur un budget
 * dur de 5 requêtes par seconde et par base partagé avec le back office.
 */

const HABILITATIONS_TABLE = process.env.AIRTABLE_HABILITATIONS_TABLE_ID ?? "tblg7Ra9xv1hnjWyP";
const CONTACTS_TABLE = process.env.AIRTABLE_CONTACTS_TABLE_ID ?? "tblcxch0hWZOVCGpT";

/** Champs lus, nommés une seule fois (le contrat avec la source). */
const HAB = {
  role: "Rôle effectif",
  contact: "Contact",
} as const;

const CONTACT = {
  email: "Email normalisé",
  fullName: "Nom complet",
} as const;

interface ContactIdentity {
  email: string | null;
  fullName: string | null;
}

/**
 * Habilitations effectives, enrichies de l'identité de leur contact.
 *
 * Une habilitation dont le contact n'ouvre pas l'accès (statut archivé, fiche
 * doublon, e-mail absent) est renvoyée avec `email: null` plutôt que supprimée
 * ici : c'est `decideAccessSync` qui la tracera en « skip » avec son motif. Rien
 * ne doit disparaître en silence entre la source et la décision.
 */
export async function fetchDesiredAccess(): Promise<DesiredAccess[]> {
  const [habilitations, contacts] = await Promise.all([
    fetchAllRecords(HABILITATIONS_TABLE, {
      fields: [HAB.role, HAB.contact],
      // Formule, donc recalculée à la date du jour par Airtable.
      filterByFormula: `{${HAB.role}} != ''`,
    }),
    fetchContactIdentities(),
  ]);

  const out: DesiredAccess[] = [];
  for (const record of habilitations) {
    const contactId = firstLinkedId(record.fields[HAB.contact]);
    const identity = contactId ? contacts.get(contactId) : undefined;
    out.push({
      habilitationId: record.id,
      email: identity?.email ?? null,
      fullName: identity?.fullName ?? null,
      roleLabel: textField(record.fields[HAB.role]),
    });
  }
  return out;
}

/** Contacts qui ouvrent l'accès à l'interface, indexés par recordID. */
async function fetchContactIdentities(): Promise<Map<string, ContactIdentity>> {
  const records = await fetchAllRecords(CONTACTS_TABLE, {
    fields: [CONTACT.email, CONTACT.fullName],
    filterByFormula: "{Accès interface} = 1",
  });
  const map = new Map<string, ContactIdentity>();
  for (const r of records) {
    map.set(r.id, {
      email: textField(r.fields[CONTACT.email]),
      fullName: textField(r.fields[CONTACT.fullName]),
    });
  }
  return map;
}
