/**
 * Synthèse d'écran-liste (INC-22) — règles pures, hors DB.
 * L'enjeu : un chiffre affiché à la coordination ne doit jamais mentir, en
 * particulier quand la donnée est incomplète (511 dossiers réels, tous les
 * champs ne sont pas renseignés).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeDossiers, FINISHED_STATUS } from "../src/lib/list-summary-rules.ts";

const row = (percent: number | null, lateDays: number | null = null, status: string | null = "En cours") =>
  ({ percent, lateDays, status });

test("une sélection vide ne produit aucun chiffre inventé", () => {
  assert.deepEqual(summarizeDossiers([]), {
    shown: 0, late: 0, finished: 0, averageProgress: null,
  });
});

test("les compteurs décrivent la sélection affichée", () => {
  const s = summarizeDossiers([
    row(72), row(45, 12), row(30, 5, "En pause"),
    row(100, null, FINISHED_STATUS), row(88), row(61, 3),
  ]);
  assert.equal(s.shown, 6);
  assert.equal(s.late, 3, "12 j, 5 j et 3 j");
  assert.equal(s.finished, 1);
});

test("un avancement inconnu est exclu de la moyenne, pas compté pour zéro", () => {
  // Le piège : compter `null` comme 0 ferait chuter la moyenne sans qu'aucun
  // apprenant n'ait pris de retard.
  const s = summarizeDossiers([row(80), row(null), row(100)]);
  assert.equal(s.averageProgress, 90, "moyenne des deux valeurs connues");
  assert.equal(s.shown, 3, "le dossier reste compté dans la sélection");
});

test("aucun avancement connu : la moyenne est absente, pas nulle", () => {
  const s = summarizeDossiers([row(null), row(null)]);
  assert.equal(s.averageProgress, null, "null se distingue de 0 %");
  assert.equal(s.shown, 2);
});

test("le retard se compte à partir d'un jour, zéro n'est pas un retard", () => {
  const s = summarizeDossiers([row(50, 0), row(50, null), row(50, 1)]);
  assert.equal(s.late, 1);
});

test("la moyenne est arrondie, jamais tronquée", () => {
  assert.equal(summarizeDossiers([row(33), row(34)]).averageProgress, 34, "33,5 → 34");
  assert.equal(summarizeDossiers([row(33), row(33)]).averageProgress, 33);
});
