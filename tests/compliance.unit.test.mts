/**
 * Conformité & pilotage — PURE unit tests (INC-5). No database, always runs
 * (even in CI without Supabase env). Covers the business rules:
 *   - completeness over the obligatory pieces;
 *   - "dossier terminé non conforme" detection;
 *   - CA-T5: a rate carries its effectif and is hidden (null) when n = 0.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compliancePieces,
  completenessScore,
  isNonConforming,
  rate,
  average,
  computeKpis,
  isInComplianceScope,
  COMPLIANCE_SCOPE_START,
  type ComplianceRow,
} from "../src/lib/compliance-rules.ts";

const base: ComplianceRow = {
  status: "En cours",
  start_date: "2026-12-01",
  certification: null,
  global_grade: null,
  insertion_situation: null,
  satisfaction_score: null,
  nps: null,
  attestation_entry_sent: null,
  convention_signed: null,
  pending_reports: null,
};

const full: ComplianceRow = {
  status: "Terminé",
  start_date: "2026-12-01",
  certification: "Oui",
  global_grade: 3,
  insertion_situation: "En poste",
  satisfaction_score: 4,
  nps: 9,
  attestation_entry_sent: true,
  convention_signed: true,
  pending_reports: 0,
};

test("there are seven obligatory pieces", () => {
  assert.equal(compliancePieces(base).length, 7);
});

test("completeness is present/total over the pieces", () => {
  assert.equal(completenessScore(full), 1);
  // base: only 'reports' is present (pending_reports null → treated as 0).
  assert.equal(completenessScore(base), 1 / 7);
  const partial: ComplianceRow = { ...base, attestation_entry_sent: true, convention_signed: true };
  assert.equal(completenessScore(partial), 3 / 7); // reports + attestation + convention
});

test("only a FINISHED dossier missing pieces is non-conforming", () => {
  assert.equal(isNonConforming(full), false, "complete finished dossier is conforming");
  assert.equal(isNonConforming({ ...base, status: "En cours" }), false, "in-progress incomplete is not flagged");
  assert.equal(isNonConforming({ ...base, status: "Terminé" }), true, "finished incomplete is non-conforming");
  assert.equal(isNonConforming({ ...full, status: "Terminé", certification: "Non" }), true, "finished missing certification");
});

test("a rate carries its effectif and is hidden when n = 0 (CA-T5)", () => {
  assert.deepEqual(rate(3, 5), { value: 0.6, n: 5 });
  assert.equal(rate(0, 0), null, "no effectif → hidden, never 0 %");
  assert.equal(average([]), null, "no values → hidden");
  assert.equal(average([null, null]), null);
  assert.deepEqual(average([2, null, 4]), { value: 3, n: 2 });
});

test("KPIs count by status and rate only over the relevant effectif", () => {
  const rows: ComplianceRow[] = [
    { ...base, status: "En cours" },
    { ...base, status: "En pause" },
    { ...full, status: "Terminé" }, // certified Oui, en poste, sat 4, nps 9
    { ...base, status: "Terminé", certification: "Non" }, // attempted, failed → non-conforming
  ];
  const k = computeKpis(rows);
  assert.equal(k.active, 1);
  assert.equal(k.paused, 1);
  assert.equal(k.finished, 2);
  assert.equal(k.total, 4);
  // certification: 1 success / 2 attempted (Oui + Non)
  assert.deepEqual(k.certification, { value: 0.5, n: 2 });
  // insertion: 1 placed / 1 known situation
  assert.deepEqual(k.insertion, { value: 1, n: 1 });
  // satisfaction / nps: only the 'full' row has values → n = 1
  assert.deepEqual(k.satisfaction, { value: 4, n: 1 });
  assert.deepEqual(k.nps, { value: 9, n: 1 });
  // one finished dossier is complete, the other misses certification → 1 non-conforming
  assert.equal(k.nonConforming, 1);
});

test("rates are hidden when nothing qualifies", () => {
  const rows: ComplianceRow[] = [{ ...base }, { ...base }];
  const k = computeKpis(rows);
  assert.equal(k.certification, null, "no certification attempts → hidden");
  assert.equal(k.insertion, null, "no known insertion → hidden");
  assert.equal(k.satisfaction, null);
  assert.equal(k.nps, null);
});

// -----------------------------------------------------------------------------
// Périmètre de la règle de complétude (décision de direction, 2026-11-06)
//
// Appliquée à tout le stock, la règle déclarait 405 dossiers non conformes sur
// 405 : trois des pièces exigées ne sont presque jamais renseignées sur les
// dossiers anciens. Une alerte qui concerne 100 % des cas n'alerte plus de rien.
// La règle ne vaut donc que pour les entrées postérieures au seuil.
// -----------------------------------------------------------------------------

/** Un dossier terminé à qui il manque la convention. */
const incomplet = (start: string | null): ComplianceRow => ({ ...full, start_date: start, convention_signed: null });

test("un dossier entré avant le seuil n'est jamais signalé non conforme", () => {
  // Le stock historique : il lui manque des pièces, mais il sort du périmètre.
  assert.equal(isNonConforming(incomplet("2024-03-15")), false);
  assert.equal(isNonConforming(incomplet("2026-10-31")), false);
});

test("un dossier entré après le seuil reste contrôlé", () => {
  assert.equal(isNonConforming(incomplet("2026-11-02")), true);
  assert.equal(isNonConforming(incomplet("2027-04-05")), true);
});

test("le seuil lui-même est inclus dans le périmètre", () => {
  assert.equal(isInComplianceScope({ ...full, start_date: COMPLIANCE_SCOPE_START }), true);
});

test("un dossier sans date d'entrée reste hors périmètre", () => {
  // On ne peut pas affirmer qu'un dossier est un nouvel entrant sans sa date :
  // alerter sur un doute produirait du bruit, pas une information.
  assert.equal(isInComplianceScope({ ...full, start_date: null }), false);
  assert.equal(isNonConforming(incomplet(null)), false);
});

test("un dossier complet dans le périmètre n'est pas signalé", () => {
  // Le périmètre ne doit pas inverser le sens de la règle : il la borne.
  assert.equal(isNonConforming({ ...full, start_date: "2026-12-01" }), false);
});

test("un dossier encore en cours n'est pas contrôlé, même dans le périmètre", () => {
  // La complétude se juge au terme du parcours, pas pendant.
  assert.equal(isNonConforming({ ...incomplet("2026-12-01"), status: "En cours" }), false);
});

test("les indicateurs distinguent les dossiers contrôlés des dossiers terminés", () => {
  // Sans `inScope`, « 0 non conforme sur 405 terminés » laisserait croire que
  // les 405 ont été contrôlés.
  const k = computeKpis([
    incomplet("2024-01-10"),          // ancien, hors périmètre
    incomplet("2024-06-20"),          // ancien, hors périmètre
    incomplet("2026-12-01"),          // contrôlé, non conforme
    { ...full, start_date: "2026-12-05" }, // contrôlé, conforme
  ]);
  assert.equal(k.finished, 4, "quatre dossiers terminés");
  assert.equal(k.inScope, 2, "dont deux seulement dans le périmètre");
  assert.equal(k.nonConforming, 1, "et un seul réellement non conforme");
});
