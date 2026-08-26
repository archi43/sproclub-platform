/**
 * Jetons de la charte SproCLUB — source de vérité unique.
 *
 * Importé par `tailwind.config.ts` (génération des classes) ET par
 * `contrast-rules.ts` / `tests/contrast.unit.test.mts` (preuve RGAA / WCAG AA).
 * Une valeur ne doit jamais être écrite en dur ailleurs : sans cela, le test de
 * contraste garantirait une palette que l'interface n'utilise pas.
 *
 * Direction « Poste de pilotage » : le navy porte la coque des rôles qui
 * opèrent (staff, coach, jury), le blanc porte celle des rôles invités
 * (apprenant, entreprise partenaire). Le rouge est un signal, jamais un décor.
 */

export const COLORS = {
  brand: { DEFAULT: "#24365E", dark: "#1A2947", mid: "#8FA3C8", tint: "#EEF1F7" },
  accent: { DEFAULT: "#F74335", tint: "#FEE7E5" },

  /** Coque navy des portails qui opèrent (rail de navigation). */
  shell: {
    DEFAULT: "#1A2947",
    item: "#24365E",
    fg: "#B9C4DA",
    "fg-strong": "#FFFFFF",
    line: "#2C3E64",
  },

  ink: "#1A1A1A",
  /** Texte secondaire (libellés, descriptions). */
  muted: "#5B6472",
  /** Filet fin unique pour bordures et divisions. */
  line: "#E7E8EC",
  grey: { 600: "#4B4B4B", 300: "#D1D5DB" },
  /** Fond de page quasi blanc. */
  surface: "#FAFAFB",

  // Couleurs sémantiques. `DEFAULT` sert d'aplat et de marque ; `ink` est la
  // seule variante autorisée en texte quand `DEFAULT` n'atteint pas AA.
  success: { DEFAULT: "#2E7D32", ink: "#276A2B", tint: "#E8F2E9" },
  warning: { DEFAULT: "#B8860B", ink: "#7A5A07", tint: "#FBF3E0" },
  error: { DEFAULT: "#C0392B", tint: "#FEE7E5" },
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
  white: "#FFFFFF",
  surface: COLORS.surface,
  brandTint: COLORS.brand.tint,
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
  // Le rouge de marque ne tient qu'en texte agrandi : c'est la règle de charte
  // « jamais de petit texte rouge », rendue vérifiable.
  { usage: "bouton accent (texte agrandi)", fg: SURFACES.white, bg: COLORS.accent.DEFAULT, large: true },
] as const;
