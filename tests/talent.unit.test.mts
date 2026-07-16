/**
 * Vivier de talents (INC-17) — règle pure de disponibilité, testée hors DB.
 * Priorité : statut coordination > déclaratif apprenant > état de la formation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAvailability } from "../src/lib/talent-rules.ts";

const TODAY = "2026-07-16";

test("le statut coordination prime sur tout le reste", () => {
  const employed = computeAvailability({ staffStatus: "employed", availableFrom: "2026-01-01", endDate: "2026-01-01", enrollmentStatus: "Terminé", today: TODAY });
  assert.equal(employed.state, "employed");
  assert.equal(employed.label, "En poste");

  const unavailable = computeAvailability({ staffStatus: "unavailable", availableFrom: null, endDate: null, enrollmentStatus: null, today: TODAY });
  assert.equal(unavailable.state, "unavailable");
});

test("en recherche : disponible maintenant, ou à la date déclarée si future", () => {
  const now = computeAvailability({ staffStatus: "searching", availableFrom: "2026-01-01", endDate: null, enrollmentStatus: "En cours", today: TODAY });
  assert.equal(now.state, "available");
  assert.equal(now.tone, "success");

  const later = computeAvailability({ staffStatus: "searching", availableFrom: "2026-09-01", endDate: null, enrollmentStatus: "En cours", today: TODAY });
  assert.equal(later.state, "soon");
  assert.match(later.label, /dès le 1 septembre 2026/);
});

test("sans statut staff : le déclaratif apprenant décide", () => {
  const past = computeAvailability({ staffStatus: null, availableFrom: "2026-07-01", endDate: null, enrollmentStatus: "En cours", today: TODAY });
  assert.equal(past.state, "available");

  const future = computeAvailability({ staffStatus: null, availableFrom: "2026-10-15", endDate: null, enrollmentStatus: "En cours", today: TODAY });
  assert.equal(future.state, "soon");
  assert.match(future.label, /15 octobre 2026/);
});

test("repli formation : terminée → disponible ; fin prévue → à venir ; sinon en formation", () => {
  const done = computeAvailability({ staffStatus: null, availableFrom: null, endDate: "2026-06-30", enrollmentStatus: "Terminé", today: TODAY });
  assert.equal(done.state, "available");
  assert.equal(done.label, "Formation terminée");

  const planned = computeAvailability({ staffStatus: null, availableFrom: null, endDate: "2026-12-20", enrollmentStatus: "En cours", today: TODAY });
  assert.equal(planned.state, "soon");
  assert.match(planned.label, /20 décembre 2026/);

  const training = computeAvailability({ staffStatus: null, availableFrom: null, endDate: null, enrollmentStatus: "En cours", today: TODAY });
  assert.equal(training.state, "in_training");
});
