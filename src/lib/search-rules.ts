/**
 * INC-21 — recherche d'un apprenant par nom ou e-mail. Règles pures.
 *
 * Le terme saisi finit dans une expression de filtre PostgREST
 * (`or=(col.ilike.%terme%,…)`), dont la grammaire est sensible aux virgules,
 * parenthèses et guillemets : un terme non assaini pourrait élargir le filtre
 * au-delà de ce que l'écran expose. La RLS resterait le garde-fou — un coach
 * ne verrait jamais les dossiers d'un autre — mais on ne laisse pas une entrée
 * utilisateur réécrire une requête.
 *
 * Les jokers `%` et `_` sont retirés : la recherche reste « contient », sans
 * qu'on puisse forger un motif qui balaie toute la base.
 */

export const MIN_SEARCH_LENGTH = 2;
export const MAX_SEARCH_LENGTH = 80;

/** Caractères qui altèrent la grammaire de filtre, ou les jokers LIKE. */
const UNSAFE = /[,()"'\\*:%_]/g;

/**
 * Terme exploitable, ou `null` s'il n'y a rien à chercher (vide, trop court
 * une fois nettoyé). Un `null` doit se traduire par « pas de filtre », jamais
 * par une recherche vide qui ne renverrait rien.
 */
export function sanitizeSearchTerm(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(UNSAFE, " ").replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_LENGTH);
  return cleaned.length >= MIN_SEARCH_LENGTH ? cleaned : null;
}

/**
 * Expression `or` PostgREST pour un « contient » insensible à la casse sur
 * plusieurs colonnes. Le terme doit avoir été assaini au préalable.
 */
export function buildIlikeOr(term: string, columns: string[]): string {
  return columns.map((c) => `${c}.ilike.%${term}%`).join(",");
}
