/**
 * Notation par le jury (INC-28) — règles pures, hors DB.
 *
 * Une note fonde une décision de certification : elle doit se rejouer à
 * l'identique devant une contestation. D'où des tests sur le barème lui-même,
 * pas seulement sur le formulaire.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGrade, gradeScale, evaluationState, canEvaluate, validateEvaluation,
  GRADE_MIN, GRADE_MAX, GRADE_STEP, COMMENT_MIN_LENGTH,
} from "../src/lib/jury-rules.ts";

const NOW = new Date("2026-09-10T12:00:00Z");
const def = (over = {}) => ({ startsAt: "2026-09-09T08:00:00Z", status: "confirmed", hasOwnReport: false, ...over });

test("le barème accepte le demi-point et rien d'autre", () => {
  for (const v of [0, 0.5, 2, 3.5, 4]) assert.equal(parseGrade(v), v, `${v} devrait passer`);
  // Une note au dixième rendrait les moyennes incomparables d'un jury à l'autre.
  assert.equal(parseGrade(3.7), null);
  assert.equal(parseGrade(1.25), null);
});

test("le barème est borné des deux côtés", () => {
  assert.equal(parseGrade(-0.5), null);
  assert.equal(parseGrade(4.5), null);
  assert.equal(parseGrade(GRADE_MIN), GRADE_MIN);
  assert.equal(parseGrade(GRADE_MAX), GRADE_MAX);
});

test("la virgule française est acceptée", () => {
  // Un évaluateur tape « 3,5 » ; refuser cette saisie serait absurde.
  assert.equal(parseGrade("3,5"), 3.5);
  assert.equal(parseGrade("3.5"), 3.5);
});

test("une saisie vide ou absurde ne devient jamais un zéro", () => {
  // Confondre « pas de note » et « zéro » condamnerait un apprenant.
  for (const bad of ["", null, undefined, "abc", "  ", NaN, Infinity]) {
    assert.equal(parseGrade(bad as never), null, `${String(bad)} ne doit pas produire de note`);
  }
});

test("l'échelle proposée couvre le barème sans trou ni doublon", () => {
  const scale = gradeScale();
  assert.equal(scale[0], GRADE_MIN);
  assert.equal(scale[scale.length - 1], GRADE_MAX);
  assert.equal(scale.length, (GRADE_MAX - GRADE_MIN) / GRADE_STEP + 1);
  assert.equal(new Set(scale).size, scale.length, "aucun doublon");
  for (const v of scale) assert.equal(parseGrade(v), v, `${v} doit être une note valide`);
});

test("une soutenance ne se note pas avant d'avoir eu lieu", () => {
  // La note porte sur une prestation observée.
  assert.equal(evaluationState(def({ startsAt: "2026-09-20T08:00:00Z" }), NOW), "à venir");
  assert.equal(canEvaluate(def({ startsAt: "2026-09-20T08:00:00Z" }), NOW), false);
});

test("une soutenance passée et non notée appelle une saisie", () => {
  assert.equal(evaluationState(def(), NOW), "à noter");
  assert.equal(canEvaluate(def(), NOW), true);
});

test("une soutenance déjà notée reste modifiable", () => {
  // Corriger une erreur de saisie doit rester possible ; c'est l'unicité en
  // base qui empêche d'ajouter une seconde note.
  assert.equal(evaluationState(def({ hasOwnReport: true }), NOW), "notée");
  assert.equal(canEvaluate(def({ hasOwnReport: true }), NOW), true);
});

test("une soutenance annulée ne se note pas, même passée", () => {
  for (const status of ["cancelled", "declined"]) {
    assert.equal(evaluationState(def({ status }), NOW), "annulée");
    assert.equal(canEvaluate(def({ status }), NOW), false);
  }
});

test("la note est obligatoire, l'appréciation aussi", () => {
  assert.equal(validateEvaluation({ grade: 3, comment: "Prestation solide, argumentation claire." }), null);

  const sansNote = validateEvaluation({ grade: "", comment: "Prestation solide et argumentée." });
  assert.equal(sansNote?.field, "grade");

  const sansCommentaire = validateEvaluation({ grade: 3, comment: "ok" });
  assert.equal(sansCommentaire?.field, "comment");
  assert.match(sansCommentaire!.message, new RegExp(String(COMMENT_MIN_LENGTH)));
});

test("une appréciation démesurée est refusée", () => {
  const rejet = validateEvaluation({ grade: 2, comment: "x".repeat(5000) });
  assert.equal(rejet?.field, "comment");
});
