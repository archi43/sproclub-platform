/**
 * Vocabulaire des statuts de dossier — règles **pures**, sans import.
 *
 * Le statut vient d'Airtable, normalisé par `sync/mapping.ts`. Tant qu'il ne
 * comptait que quatre valeurs, chaque module portait son propre filtre en dur.
 * Depuis que « Prêt à débuter » et « Annulée » sont reconnus (INC-24), la
 * distinction *actif / inactif* décide qui reçoit des relances : elle mérite
 * un seul endroit.
 */

/** Toutes les valeurs que la synchronisation sait produire. */
export const ENROLLMENT_STATUSES = [
  "Prêt à débuter",
  "En cours",
  "En pause",
  "Terminé",
  "Abandon",
  "Annulée",
] as const;

export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

/**
 * Statuts qui **ferment** un dossier : plus aucune action pédagogique n'est
 * attendue. Ils sortent de la file d'opérations et des relances.
 *
 * `Abandon` n'y figure pas volontairement : un abandon se constate mais se
 * rattrape parfois, et la coordination doit continuer à le voir. `Annulée`,
 * elle, désigne une commande qui n'a jamais démarré — relancer l'apprenant
 * serait une erreur visible de lui.
 */
export const CLOSED_STATUSES: readonly EnrollmentStatus[] = ["Terminé", "Annulée"];

export function isClosed(status: string | null | undefined): boolean {
  return status != null && (CLOSED_STATUSES as readonly string[]).includes(status);
}

/**
 * Filtre PostgREST excluant les dossiers clos, statut absent compris.
 *
 * PostgREST assemble les filtres de premier niveau par ET, et `.or(...)` n'est
 * qu'un prédicat de plus dans ce ET : `.eq("org_id", …).or(EXCLUDE_CLOSED)`
 * signifie `org_id = … AND (status IS NULL OR (status <> … AND …))`.
 * Le `.or` n'élargit donc jamais la portée de l'organisme — garder `org_id`
 * en appel chaîné séparé, jamais dans cette chaîne.
 *
 * Un statut nul reste inclus : un dossier sans statut est un trou de données,
 * pas un dossier clos ; le masquer le rendrait invisible au lieu de le signaler.
 *
 * **Piège** : `.or(a,b)` est un OU. Enchaîner `status.neq.Terminé,status.neq.Annulée`
 * donnerait `status <> 'Terminé' OU status <> 'Annulée'`, toujours vrai — le
 * filtre n'exclurait plus rien. Les exclusions passent donc par un `and(...)`
 * imbriqué, seule forme correcte au-delà d'une valeur.
 */
export const EXCLUDE_CLOSED = `status.is.null,and(${CLOSED_STATUSES.map((s) => `status.neq.${s}`).join(",")})`;
