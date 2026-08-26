/**
 * Contraste de couleurs — règles **pures** (WCAG 2.1, §1.4.3 et §1.4.11).
 *
 * Aucune dépendance : ni base, ni horloge, ni import. Un contraste se recalcule
 * à l'identique, ce qui permet de rejouer la preuve d'accessibilité si un
 * financeur ou un audit Qualiopi la conteste. Le module ne connaît pas la
 * charte : il reçoit les paires à vérifier (voir `design-tokens.ts`), ce qui le
 * garde testable hors de tout contexte applicatif.
 *
 * Référence : https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */

/** Seuils AA. Le texte agrandi (≥ 18,66 px gras ou ≥ 24 px) descend à 3:1. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;
/** Seuil des composants d'interface et éléments graphiques (§1.4.11). */
export const AA_NON_TEXT = 3;

/** Contrat d'entrée minimal : toute paire de la charte le satisfait. */
export interface ContrastCheck {
  fg: string;
  bg: string;
  /** `true` pour un texte agrandi — abaisse le seuil requis à 3:1. */
  large?: boolean;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export class ContrastError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContrastError";
  }
}

/** `#abc` ou `#aabbcc` → [r, g, b] sur 0–255. Rejette tout le reste. */
export function parseHex(hex: string): [number, number, number] {
  if (!HEX.test(hex)) throw new ContrastError(`Couleur hexadécimale invalide : ${hex}`);
  const h = hex.slice(1);
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Linéarisation sRGB d'une composante 0–255 (WCAG). */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Luminance relative : 0 (noir) → 1 (blanc). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(linearize);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste entre deux couleurs opaques, de 1:1 à 21:1. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Seuil applicable à une paire selon qu'elle porte du texte agrandi. */
export function requiredRatio(pair: ContrastCheck): number {
  return pair.large ? AA_LARGE : AA_NORMAL;
}

export type PairVerdict<T extends ContrastCheck> = T & {
  ratio: number;
  required: number;
  passes: boolean;
};

/** Verdict d'une paire, arrondi au centième (comme les rapports d'audit). */
export function checkPair<T extends ContrastCheck>(pair: T): PairVerdict<T> {
  const ratio = Math.round(contrastRatio(pair.fg, pair.bg) * 100) / 100;
  const required = requiredRatio(pair);
  return { ...pair, ratio, required, passes: ratio >= required };
}

/** Verdict d'un jeu de paires. Sert au test et à un export d'audit. */
export function auditPairs<T extends ContrastCheck>(pairs: readonly T[]): PairVerdict<T>[] {
  return pairs.map(checkPair);
}

/** Les paires qui échouent, pour un message d'erreur exploitable. */
export function failingPairs<T extends ContrastCheck>(pairs: readonly T[]): PairVerdict<T>[] {
  return auditPairs(pairs).filter((v) => !v.passes);
}
