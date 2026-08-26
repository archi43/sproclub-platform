/**
 * Contraste de la charte (INC-22) — preuve RGAA / WCAG AA, hors DB.
 *
 * Ce test est la pièce d'audit : il recalcule les rapports de contraste de
 * TOUTES les combinaisons texte/fond que l'interface déclare garantir. Ajouter
 * une paire à `CHARTE_TEXT_PAIRS` sans qu'elle tienne fait échouer la suite —
 * c'est ce qui empêche d'introduire un contraste non conforme par mégarde.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contrastRatio, relativeLuminance, parseHex, checkPair, failingPairs,
  requiredRatio, ContrastError, AA_NORMAL, AA_LARGE,
} from "../src/lib/contrast-rules.ts";
import {
  COLORS, SURFACES, CHARTE_TEXT_PAIRS, TEXT_BACKGROUND_TINTS,
} from "../src/lib/design-tokens.ts";

test("la formule WCAG donne les bornes connues", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#FFFFFF") * 100) / 100, 21);
  assert.equal(contrastRatio("#FFFFFF", "#FFFFFF"), 1);
  // Le rapport ne dépend pas de l'ordre des arguments.
  assert.equal(contrastRatio("#24365E", "#FFFFFF"), contrastRatio("#FFFFFF", "#24365E"));
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#FFFFFF"), 1);
});

test("les notations hexadécimales acceptées sont équivalentes", () => {
  assert.deepEqual(parseHex("#FFF"), [255, 255, 255]);
  assert.deepEqual(parseHex("#24365E"), [36, 54, 94]);
  assert.deepEqual(parseHex("#24365e"), parseHex("#24365E"), "casse indifférente");
});

test("une couleur invalide échoue franchement, jamais en silence", () => {
  for (const bad of ["24365E", "#12345", "#GGGGGG", "rgb(0,0,0)", "", "#"]) {
    assert.throws(() => parseHex(bad), ContrastError, `devrait rejeter : ${bad}`);
  }
});

test("le seuil dépend de la taille du texte", () => {
  assert.equal(requiredRatio({ fg: "#000", bg: "#FFF" }), AA_NORMAL);
  assert.equal(requiredRatio({ fg: "#000", bg: "#FFF", large: true }), AA_LARGE);
});

test("TOUTE la charte tient le niveau AA", () => {
  const failing = failingPairs(CHARTE_TEXT_PAIRS);
  const detail = failing
    .map((f) => `${f.usage} — ${f.fg} sur ${f.bg} : ${f.ratio}:1 < ${f.required}:1 requis`)
    .join("\n");
  assert.equal(failing.length, 0, `Paires non conformes :\n${detail}`);
});

test("le navy et le texte secondaire dépassent largement le seuil", () => {
  // Repères chiffrés : ils figent la charte contre une dérive « esthétique ».
  assert.ok(checkPair({ fg: COLORS.brand.DEFAULT, bg: SURFACES.white }).ratio > 10);
  assert.ok(checkPair({ fg: COLORS.muted, bg: SURFACES.white }).ratio > 5.5);
  assert.ok(checkPair({ fg: COLORS.shell.fg, bg: SURFACES.shell }).ratio > 7);
});

test("le rouge de marque reste interdit en petit texte sur blanc", () => {
  // La règle de charte « jamais de petit texte rouge sur blanc » n'est pas une
  // préférence : #F74335 plafonne sous 4,5:1. On le prouve pour que personne ne
  // le réintroduise en pensant bien faire.
  const red = checkPair({ fg: COLORS.accent.DEFAULT, bg: SURFACES.white });
  assert.ok(red.ratio < AA_NORMAL, `#F74335 mesure ${red.ratio}:1`);
  assert.ok(red.ratio >= AA_LARGE, "il reste utilisable en texte agrandi et en aplat");

  // Le rouge textuel de la charte, lui, passe : c'est `error`, pas `accent`.
  assert.ok(checkPair({ fg: COLORS.error.DEFAULT, bg: SURFACES.white }).passes);
});

test("le vert de succès n'est admis sur son fond teinté que foncé", () => {
  // #2E7D32 sur #E8F2E9 mesure 4,47:1 — sous le seuil de 0,03. Défaut relevé
  // par ce test pendant la refonte ; `success.ink` le corrige.
  const raw = checkPair({ fg: COLORS.success.DEFAULT, bg: SURFACES.successTint });
  assert.ok(raw.ratio < AA_NORMAL, `#2E7D32 mesure ${raw.ratio}:1 sur sa teinte`);
  assert.ok(checkPair({ fg: COLORS.success.ink, bg: SURFACES.successTint }).passes);
  // Sur blanc, le vert plein suffit : la variante foncée ne sert qu'aux teintes.
  assert.ok(checkPair({ fg: COLORS.success.DEFAULT, bg: SURFACES.white }).passes);
});

test("le jaune d'avertissement n'est admis en texte que dans sa variante foncée", () => {
  // #B8860B mesure ~3,25:1 sur blanc : il échoue en texte courant. C'est le
  // défaut de charte relevé pendant la refonte ; `warning.ink` le corrige.
  const raw = checkPair({ fg: COLORS.warning.DEFAULT, bg: SURFACES.white });
  assert.ok(raw.ratio < AA_NORMAL, `#B8860B mesure ${raw.ratio}:1`);

  assert.ok(checkPair({ fg: COLORS.warning.ink, bg: SURFACES.white }).passes);
  assert.ok(checkPair({ fg: COLORS.warning.ink, bg: SURFACES.warningTint }).passes);
});

test("aucune teinte de fond ne reste sans paire prouvée", () => {
  // Garde-fou structurel : une teinte peut exister comme jeton, être utilisée
  // en fond de texte dans un composant, et n'être couverte par AUCUNE paire.
  // Le contraste serait alors non prouvé — ou prouvé par coïncidence, si une
  // autre teinte de même valeur figure dans la liste. C'est ce qui s'est passé
  // avec `error.tint`, doublon d'`accent.tint`.
  const covered = new Set(CHARTE_TEXT_PAIRS.map((p) => p.bg));
  for (const [name, hex] of Object.entries(TEXT_BACKGROUND_TINTS)) {
    assert.ok(covered.has(hex), `${name} (${hex}) n'est le fond d'aucune paire déclarée`);
  }
});

test("chaque paire déclarée porte un usage lisible par un auditeur", () => {
  for (const pair of CHARTE_TEXT_PAIRS) {
    assert.ok(pair.usage.length > 3, `usage trop vague : ${JSON.stringify(pair)}`);
    assert.match(pair.fg, /^#[0-9A-Fa-f]{6}$/);
    assert.match(pair.bg, /^#[0-9A-Fa-f]{6}$/);
  }
  assert.ok(CHARTE_TEXT_PAIRS.length >= 15, "la charte doit couvrir ses usages réels");
});
