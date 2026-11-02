/**
 * Jetons du design system SproClub (refonte de juillet 2026) — source de vérité unique.
 *
 * Importé par `tailwind.config.ts` (génération des classes) ET par
 * `contrast-rules.ts` / `tests/contrast.unit.test.mts` (preuve RGAA / WCAG AA).
 * Une valeur ne doit jamais être écrite en dur ailleurs : sans cela, le test de
 * contraste garantirait une palette que l'interface n'utilise pas.
 *
 * Les valeurs viennent de l'export Figma « SPROCLUB — Refonte website », page
 * « Design System Recap » (relevé du 2026-07-21). Elles remplacent l'ancienne
 * charte (rouge #F74335, Montserrat, Hind Madurai), déclarée obsolète.
 *
 * La plateforme est un **outil fonctionnel** au sens du design system : on en
 * prend les jetons, les composants et l'ombre de card, jamais le décor de marque
 * (formes filaires, halo). Le fond sombre n'habille que la coque de navigation,
 * en Dark Navy, jamais une zone de contenu.
 *
 * Un écart assumé : le design system pose du texte blanc sur terracotta `#d85d3b`,
 * qui ne mesure que 3,78:1 (seuil AA : 4,5:1). Le terracotta pur reste donc un
 * filet, un marqueur ou du texte agrandi ; le texte courant et les boutons
 * passent par `accent.strong` (terracotta 700 de l'échelle officielle).
 */

export const COLORS = {
  /** Navy : marque, titres, boutons pleins. `deep` = Dark Navy, seul fond sombre admis. */
  brand: { DEFAULT: "#24365e", dark: "#1a2643", deep: "#0f1727", mid: "#9aa3b5", tint: "#e9ebef" },
  /** Terracotta : accent primaire, signal d'action. `strong` = variante lisible en petit texte. */
  accent: { DEFAULT: "#d85d3b", strong: "#99422a", hover: "#773320", tint: "#fbefeb" },

  /** Coque des portails qui opèrent (rail de navigation), en Dark Navy. */
  shell: {
    DEFAULT: "#0f1727",
    item: "#24365e",
    fg: "#bbc1cd",
    "fg-strong": "#ffffff",
    line: "#1a2643",
  },

  /** Corps de texte : Dark Navy, comme le prescrit le design system. */
  ink: "#0f1727",
  /** Texte secondaire (libellés, descriptions) : bleu 400 de l'échelle officielle. */
  muted: "#505e7e",
  /** Bordure par défaut du design system. */
  line: "#dddde4",
  grey: { 600: "#666669", 300: "#dddde4" },
  /** Fond des sections, des champs et de la page. */
  surface: "#f3f3fa",

  // Couleurs sémantiques (hors design system, qui n'en définit pas : un outil en
  // a besoin). `DEFAULT` sert d'aplat et de marque ; `ink` est la seule variante
  // autorisée en texte quand `DEFAULT` n'atteint pas AA.
  success: { DEFAULT: "#2E7D32", ink: "#276A2B", tint: "#E8F2E9" },
  warning: { DEFAULT: "#B8860B", ink: "#7A5A07", tint: "#FBF3E0" },
  error: { DEFAULT: "#C0392B", tint: "#FEE7E5" },
} as const;

/** Ombre de card du design system : seule ombre admise dans l'interface. */
export const SHADOWS = {
  card: "0px 4px 5px rgba(0,45,116,0.08)",
} as const;

/**
 * Fonds sur lesquels du texte est posé dans l'interface.
 *
 * Chaque entrée doit désigner le jeton **exactement tel que la classe Tailwind
 * le résout** : `bg-error-tint` compile `COLORS.error.tint`, donc la paire doit
 * référencer `COLORS.error.tint` et non `COLORS.accent.tint`, même quand les
 * deux valent la même valeur. Sans cela, la preuve de contraste tiendrait par
 * coïncidence et deviendrait fausse à la première divergence.
 */
export const SURFACES = {
  white: "#ffffff",
  surface: COLORS.surface,
  brandTint: COLORS.brand.tint,
  accentTint: COLORS.accent.tint,
  successTint: COLORS.success.tint,
  warningTint: COLORS.warning.tint,
  errorTint: COLORS.error.tint,
  brand: COLORS.brand.DEFAULT,
  shell: COLORS.shell.DEFAULT,
  shellItem: COLORS.shell.item,
} as const;

/** Teintes servant de fond à du texte : chacune doit être prouvée (voir test). */
export const TEXT_BACKGROUND_TINTS = {
  "brand.tint": COLORS.brand.tint,
  "accent.tint": COLORS.accent.tint,
  "success.tint": COLORS.success.tint,
  "warning.tint": COLORS.warning.tint,
  "error.tint": COLORS.error.tint,
} as const;

export interface TextPair {
  /** Ce que la paire habille, en clair — sert de repère à l'audit. */
  usage: string;
  fg: string;
  bg: string;
  /** `true` pour un texte ≥ 18,66 px gras ou ≥ 24 px (seuil AA abaissé à 3:1). */
  large?: boolean;
}

/**
 * Combinaisons texte/fond que l'interface garantit au niveau AA.
 * Ajouter une paire ici avant de l'utiliser dans un écran : le test échoue si
 * elle ne tient pas, ce qui interdit d'introduire un contraste non conforme.
 */
export const CHARTE_TEXT_PAIRS: readonly TextPair[] = [
  // Texte courant sur fonds clairs
  { usage: "titre de page", fg: COLORS.brand.DEFAULT, bg: SURFACES.white },
  { usage: "texte principal", fg: COLORS.ink, bg: SURFACES.white },
  { usage: "texte principal sur fond de page", fg: COLORS.ink, bg: SURFACES.surface },
  { usage: "texte secondaire", fg: COLORS.muted, bg: SURFACES.white },
  { usage: "texte secondaire sur fond de page", fg: COLORS.muted, bg: SURFACES.surface },
  { usage: "lien de navigation inactif", fg: COLORS.muted, bg: SURFACES.brandTint },

  // Pastilles et alertes
  { usage: "pastille marque", fg: COLORS.brand.DEFAULT, bg: SURFACES.brandTint },
  { usage: "pastille succès", fg: COLORS.success.ink, bg: SURFACES.successTint },
  { usage: "pastille avertissement", fg: COLORS.warning.ink, bg: SURFACES.warningTint },
  { usage: "pastille erreur / retard", fg: COLORS.error.DEFAULT, bg: SURFACES.errorTint },
  { usage: "tuile de synthèse critique", fg: COLORS.error.DEFAULT, bg: SURFACES.errorTint },
  { usage: "alerte succès sur blanc", fg: COLORS.success.DEFAULT, bg: SURFACES.white },
  { usage: "alerte avertissement sur blanc", fg: COLORS.warning.ink, bg: SURFACES.white },
  { usage: "alerte erreur sur blanc", fg: COLORS.error.DEFAULT, bg: SURFACES.white },

  // Coque navy
  { usage: "lien de nav actif dans la coque", fg: COLORS.shell["fg-strong"], bg: SURFACES.shellItem },
  { usage: "lien de nav inactif dans la coque", fg: COLORS.shell.fg, bg: SURFACES.shell },
  { usage: "nom de l'organisme dans la coque", fg: COLORS.shell["fg-strong"], bg: SURFACES.shell },

  // Boutons
  { usage: "bouton primaire", fg: SURFACES.white, bg: COLORS.brand.DEFAULT },
  { usage: "bouton danger", fg: SURFACES.white, bg: COLORS.error.DEFAULT },
  { usage: "bouton primaire au survol", fg: SURFACES.white, bg: COLORS.brand.dark },
  // Terracotta : le pur ne porte du texte blanc qu'agrandi (3,78:1) ; en petit
  // texte et sur les boutons, c'est la variante `strong` qui parle.
  { usage: "bouton accent", fg: SURFACES.white, bg: COLORS.accent.strong },
  { usage: "bouton accent au survol", fg: SURFACES.white, bg: COLORS.accent.hover },
  { usage: "texte accent (lien, signal)", fg: COLORS.accent.strong, bg: SURFACES.white },
  { usage: "pastille accent", fg: COLORS.accent.strong, bg: SURFACES.accentTint },
  { usage: "texte agrandi sur terracotta", fg: SURFACES.white, bg: COLORS.accent.DEFAULT, large: true },
] as const;
