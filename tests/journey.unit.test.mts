/**
 * Écran « Mon parcours » (P.A1) — règles d'alerte et d'avancement, hors DB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildJourneyAlerts,
  daysUntil,
  progressPercent,
} from "../src/lib/journey-rules.ts";

const NOW = new Date("2026-09-01T10:00:00Z");
const base = { status: "En formation", accessEndDate: null, endDate: null, next: null, missingPieces: [], now: NOW };

test("l'accès serveur qui expire passe d'alerte à urgence", () => {
  const far = buildJourneyAlerts({ ...base, accessEndDate: "2026-12-01" });
  assert.equal(far.length, 0, "au-delà de 30 jours, rien");

  const soon = buildJourneyAlerts({ ...base, accessEndDate: "2026-09-20" });
  assert.equal(soon[0].key, "access-soon");
  assert.equal(soon[0].tone, "warning");

  const urgent = buildJourneyAlerts({ ...base, accessEndDate: "2026-09-05" });
  assert.equal(urgent[0].key, "access-urgent");
  assert.equal(urgent[0].tone, "error");
});

test("un dossier terminé n'alerte plus sur ses échéances", () => {
  const alerts = buildJourneyAlerts({ ...base, status: "Terminé", accessEndDate: "2026-09-05" });
  assert.equal(alerts.length, 0);
});

test("un accès déjà expiré n'alerte pas (l'échéance est passée)", () => {
  const alerts = buildJourneyAlerts({ ...base, accessEndDate: "2026-08-01" });
  assert.equal(alerts.length, 0);
});

test("un créneau réservé non confirmé est signalé", () => {
  const alerts = buildJourneyAlerts({
    ...base,
    next: { kind: "defense", startsAt: "2026-09-20T09:00:00Z", status: "pending" },
  });
  assert.equal(alerts[0].key, "booking-pending");
  assert.match(alerts[0].message, /soutenance/);
});

test("l'échéance proche est mise en avant, pas l'échéance lointaine", () => {
  const soon = buildJourneyAlerts({
    ...base,
    next: { kind: "coaching", startsAt: "2026-09-03T09:00:00Z", status: "confirmed" },
  });
  assert.equal(soon[0].key, "deadline-soon");
  assert.match(soon[0].message, /coaching/);

  const later = buildJourneyAlerts({
    ...base,
    next: { kind: "coaching", startsAt: "2026-09-20T09:00:00Z", status: "confirmed" },
  });
  assert.equal(later.length, 0);
});

test("les documents à fournir sont listés en une seule alerte", () => {
  const alerts = buildJourneyAlerts({ ...base, missingPieces: ["Convention", "Questionnaire"] });
  assert.equal(alerts[0].key, "missing-pieces");
  assert.match(alerts[0].message, /Convention, Questionnaire/);
});

test("les alertes sortent de la plus urgente à la moins urgente", () => {
  const alerts = buildJourneyAlerts({
    ...base,
    accessEndDate: "2026-09-03",
    next: { kind: "defense", startsAt: "2026-09-02T09:00:00Z", status: "pending" },
    missingPieces: ["Convention"],
  });
  assert.deepEqual(
    alerts.map((a) => a.key),
    ["access-urgent", "booking-pending", "deadline-soon", "missing-pieces"]
  );
});

test("daysUntil compte en jours entiers et gère l'absence de date", () => {
  assert.equal(daysUntil(null, NOW), null);
  assert.equal(daysUntil("pas une date", NOW), null);
  assert.equal(daysUntil("2026-09-01", NOW), 1, "fin de journée courante");
  assert.equal(daysUntil("2026-08-30", NOW), -1);
});

test("l'avancement accepte les deux échelles de la source", () => {
  assert.equal(progressPercent(0.72), 72, "échelle 0–1");
  assert.equal(progressPercent(72), 72, "échelle 0–100");
  assert.equal(progressPercent(null), null);
  assert.equal(progressPercent(140), 100, "borné");
  assert.equal(progressPercent(-5), 0);
});
