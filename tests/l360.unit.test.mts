/**
 * Pont 360Learning (INC-15) — règles pures, testées hors DB.
 * Les cas de nommage viennent des parcours RÉELS de l'instance SproCLUB
 * (« Projet n°5: … », « Projet 3 - … », « Projets 6, 7 & 8 », « Projet à
 * compléter : … »).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideDeliverableState,
  extractProjectNumber,
  latestStatPerUser,
  pickDepositCourseId,
  crossProjectCourseIds,
  shouldRepairDepositCourse,
  attemptBelongsToPath,
  unconfirmedDepositKeys,
  type L360PathStatRecord,
} from "../src/lib/l360-rules.ts";

test("extractProjectNumber reconnaît les variantes réelles de nommage", () => {
  assert.equal(extractProjectNumber("Projet n°5: Analyser et résoudre un incident"), 5);
  assert.equal(extractProjectNumber("Projet n°2: former un utilisateur"), 2);
  assert.equal(extractProjectNumber("Projet 1 - Analyser les besoins d’une organisation"), 1);
  assert.equal(extractProjectNumber("Projet n° 8: Analyser un besoin / fit to standard"), 8);
  assert.equal(extractProjectNumber("projet 4: Tester l’implémentation"), 4, "insensible à la casse");
});

test("extractProjectNumber écarte regroupements et libellés sans numéro", () => {
  assert.equal(extractProjectNumber("Devenir consultant SAP digital - FI [Finance] Projets 6, 7 & 8"), null);
  assert.equal(extractProjectNumber("Projet à compléter : Rédiger une spécification"), null);
  assert.equal(extractProjectNumber("Projet à compléter :Réaliser une reprise de business partner dans SAP S/4 HANA 2020"), null);
  assert.equal(extractProjectNumber("Fondamentaux techniques du consultant"), null);
  assert.equal(extractProjectNumber("Projet n°0: invalide"), null, "un numéro de projet est strictement positif");
});

test("pickDepositCourseId : sans contexte, le dernier cours (repli historique)", () => {
  const steps = [
    { id: "c1", type: "course" },
    { id: "e1", type: "email" },
    { id: "c2", type: "course" },
    { id: "cl1", type: "classroom" },
  ];
  assert.equal(pickDepositCourseId(steps), "c2", "dernier pas de type course, pas le dernier pas tout court");
  assert.equal(pickDepositCourseId([{ id: "a1", type: "assessment" }]), null, "aucun cours → pas de signal de dépôt");
  assert.equal(pickDepositCourseId([]), null);
});

// Forme réelle constatée le 2026-11-02 : 33 parcours sur 35 finissent par le
// questionnaire « Votre avis nous intéresse », partagé par tous les projets.
const SURVEY = "survey";
const realPaths = [
  { name: "Projet n°2: former un utilisateur", steps: [{ id: "intro2", type: "course" }, { id: "rendu2", type: "course" }, { id: SURVEY, type: "course" }] },
  { name: "Projet n°3: rédiger une spécification", steps: [{ id: "rendu3", type: "course" }, { id: SURVEY, type: "course" }] },
  // Même cours de rendu, numéroté 8 dans un programme et 5 dans l'autre.
  { name: "Projet n°8: Analyser un besoin - F2M", steps: [{ id: "fit", type: "course" }, { id: SURVEY, type: "course" }] },
  { name: "Projet 5 : Analyser un besoin (no-code)", steps: [{ id: "fit", type: "course" }, { id: SURVEY, type: "course" }] },
  // Cours de rendu qui ne suit pas la convention de nommage.
  { name: "Projet 1 : Analyser les besoins d'une organisation", steps: [{ id: "cas1", type: "course" }, { id: SURVEY, type: "course" }] },
];
const names = new Map([
  ["intro2", "Processus métier"], ["rendu2", "Projet : Former un utilisateur"],
  ["rendu3", "Projet : Rédiger une spécification"], ["fit", "Projet : Analyser un besoin : fit to standard"],
  ["cas1", "Cas 1 : Desko Inc. — Diagnostic"], [SURVEY, "Votre avis nous intéresse"],
]);

test("crossProjectCourseIds : le questionnaire et le rendu réutilisé sont transverses", () => {
  const cross = crossProjectCourseIds(realPaths);
  assert.ok(cross.has(SURVEY), "présent dans des projets de numéros différents");
  assert.ok(cross.has("fit"), "le rendu réutilisé l'est aussi : d'où la priorité au nom");
  assert.ok(!cross.has("rendu2") && !cross.has("cas1"));
});

test("pickDepositCourseId : jamais le questionnaire, le nom prime, le partage sert de repli", () => {
  const ctx = { courseNames: names, crossProjectCourseIds: crossProjectCourseIds(realPaths) };
  const [p2, p3, p8, p5, p1] = realPaths.map((p) => pickDepositCourseId(p.steps, ctx));
  assert.equal(p2, "rendu2", "le dernier cours nommé « Projet … », pas le dernier cours");
  assert.equal(p3, "rendu3");
  assert.equal(p8, "fit", "un rendu partagé reste choisi grâce à son nom");
  assert.equal(p5, "fit");
  assert.equal(p1, "cas1", "sans nom conventionnel : le dernier cours non transverse");
  assert.ok(![p2, p3, p8, p5, p1].includes(SURVEY));
  assert.equal(pickDepositCourseId([{ id: SURVEY, type: "course" }], ctx), null, "seul un cours transverse : aucun signal plutôt qu'un faux");
});

test("shouldRepairDepositCourse : corrige l'erreur, respecte une correction manuelle", () => {
  const cross = new Set([SURVEY]);
  assert.equal(shouldRepairDepositCourse(SURVEY, "rendu2", cross), true, "questionnaire → vrai rendu");
  assert.equal(shouldRepairDepositCourse(SURVEY, null, cross), true, "parcours plus listé : on retire le faux signal");
  assert.equal(shouldRepairDepositCourse(null, "rendu2", cross), true, "pas de cours → le cours calculé");
  assert.equal(shouldRepairDepositCourse("manuel", "rendu2", cross), false, "un cours propre choisi à la main reste");
  assert.equal(shouldRepairDepositCourse("rendu2", "rendu2", cross), false);
  assert.equal(shouldRepairDepositCourse(null, null, cross), false);
});

test("attemptBelongsToPath : seule une tentative faite dans ce parcours compte", () => {
  assert.equal(attemptBelongsToPath("p3", "p3"), true);
  assert.equal(attemptBelongsToPath("p-autre", "p3"), false, "même cours, autre parcours");
  assert.equal(attemptBelongsToPath(null, "p3"), false, "tentative hors parcours (4 sur 234 en réel, toutes anciennes)");
});

test("latestStatPerUser garde l'inscription la plus récente par apprenant", () => {
  const mk = (userId: string, enrolledAt: string | null, statusType = "onTime"): L360PathStatRecord => ({
    userId,
    pathId: "p1",
    statusType,
    progress: 50,
    score: null,
    enrolledAt,
    completedAt: null,
  });
  const out = latestStatPerUser([mk("u1", "2025-01-01"), mk("u1", "2026-01-01", "successful"), mk("u2", null)]);
  assert.equal(out.length, 2);
  assert.equal(out.find((s) => s.userId === "u1")?.statusType, "successful", "la session 2026 supplante la 2025");
  assert.ok(out.some((s) => s.userId === "u2"), "un enrolledAt null n'écarte pas l'apprenant");
});

test("decideDeliverableState : validation jury → dépôt + validation + score", () => {
  const state = decideDeliverableState({
    statusType: "successful",
    pathCompletedAt: "2026-06-01T10:00:00Z",
    score: 92,
    depositCompletedAt: "2026-05-20T09:00:00Z",
  });
  assert.deepEqual(state, {
    submitted: true,
    submittedAt: "2026-05-20T09:00:00Z", // la date de dépôt prime sur la date de validation
    validatedAt: "2026-06-01T10:00:00Z",
    score: 92,
  });
});

test("decideDeliverableState : dépôt en attente de correction → soumis, non validé", () => {
  const state = decideDeliverableState({
    statusType: "onTime",
    pathCompletedAt: null,
    score: 40, // score partiel en cours de parcours : ignoré tant que non validé
    depositCompletedAt: "2026-06-10T08:00:00Z",
  });
  assert.deepEqual(state, { submitted: true, submittedAt: "2026-06-10T08:00:00Z", validatedAt: null, score: null });
});

test("decideDeliverableState : rien déposé → aucun écrit (jamais de downgrade)", () => {
  const state = decideDeliverableState({ statusType: "onTime", pathCompletedAt: null, score: null, depositCompletedAt: null });
  assert.equal(state.submitted, false);
});

test("decideDeliverableState : parcours sans cours de rendu validé → la validation vaut dépôt", () => {
  const state = decideDeliverableState({
    statusType: "successful",
    pathCompletedAt: "2026-06-01T10:00:00Z",
    score: 80,
    depositCompletedAt: null,
  });
  assert.equal(state.submitted, true);
  assert.equal(state.submittedAt, "2026-06-01T10:00:00Z", "repli sur la date de validation");
});

test("unconfirmedDepositKeys : les dépôts non validés que rien ne confirme plus", () => {
  const existing = [
    { enrollment_id: "e1", project_number: 1, validated_at: null },
    { enrollment_id: "e1", project_number: 2, validated_at: null },
    { enrollment_id: "e1", project_number: 3, validated_at: "2026-06-01T00:00:00Z" },
  ];
  assert.deepEqual(unconfirmedDepositKeys(existing, new Set(["e1:1"])), ["e1:2"], "un validé n'est jamais compté");
});
