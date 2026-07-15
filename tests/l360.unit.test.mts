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

test("pickDepositCourseId prend le dernier cours du parcours", () => {
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
