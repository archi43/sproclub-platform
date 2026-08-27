/**
 * Mapping Airtable → Postgres (INC-24) — règles pures, hors DB.
 *
 * Trois défauts constatés sur la base réelle le 2026-08-27 :
 *   1. `specialty` et `end_date` n'étaient mappés nulle part — les écrans
 *      affichaient un vide alors qu'Airtable portait la donnée ;
 *   2. les statuts « Prêt à débuter » et « Annulée » n'étaient pas reconnus,
 *      donc 41 dossiers arrivaient sans statut et disparaissaient des compteurs ;
 *   3. la spécialisation multiple (`A;B`) devait rester lisible.
 * Ces tests figent les trois corrections.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SRC, buildEnrollment, type SourceRecord } from "../src/lib/sync/mapping.ts";

const rec = (fields: Record<string, unknown>): SourceRecord => ({ id: "recAAAAAAAAAAAAAA", fields });

test("les statuts préfixés de la base sont reconnus", () => {
  // Airtable numérote ses valeurs : « 6-Terminé », « 3-En cours »…
  const cases: [string, string][] = [
    ["6-Terminé", "Terminé"],
    ["3-En cours", "En cours"],
    ["4-En pause", "En pause"],
    ["5-Abandon", "Abandon"],
  ];
  for (const [raw, expected] of cases) {
    assert.equal(buildEnrollment(rec({ [SRC.statut]: raw })).status, expected, raw);
  }
});

test("les deux statuts oubliés sont désormais repris", () => {
  // 22 dossiers « Prêt à débuter » et 19 « Annulée » arrivaient à null.
  assert.equal(buildEnrollment(rec({ [SRC.statut]: "1-Prêt à débuter" })).status, "Prêt à débuter");
  assert.equal(buildEnrollment(rec({ [SRC.statut]: "2-Annulée" })).status, "Annulée");
});

test("un statut inconnu reste vide plutôt que d'être rangé au hasard", () => {
  assert.equal(buildEnrollment(rec({ [SRC.statut]: "9-Quelque chose de neuf" })).status, undefined);
  assert.equal(buildEnrollment(rec({})).status, undefined);
});

test("la fin prévue suit l'ordre de fiabilité des trois champs de fin", () => {
  // Sur un dossier actif, seule la « prévisionnelle » est renseignée (86 %) ;
  // la « réélle » n'est posée qu'à la clôture (7 %).
  const all = buildEnrollment(rec({
    [SRC.dateFinPrev]: "2026-10-29",
    [SRC.dateFinPlan]: "2026-10-31",
    [SRC.dateFinReelle]: "2026-11-15",
  }));
  assert.equal(all.end_date, "2026-10-29", "la prévisionnelle prime");

  const plan = buildEnrollment(rec({ [SRC.dateFinPlan]: "2026-10-31", [SRC.dateFinReelle]: "2026-11-15" }));
  assert.equal(plan.end_date, "2026-10-31", "à défaut, la planifiée");

  const reelle = buildEnrollment(rec({ [SRC.dateFinReelle]: "2026-11-15" }));
  assert.equal(reelle.end_date, "2026-11-15", "en dernier recours, la réelle");

  assert.equal(buildEnrollment(rec({})).end_date, undefined, "aucune date : pas de valeur inventée");
});

test("la fin prévue ne se confond pas avec la fin des accès", () => {
  const e = buildEnrollment(rec({ [SRC.dateFinPrev]: "2026-10-29", [SRC.dateFinAcces]: "2026-12-31" }));
  assert.equal(e.end_date, "2026-10-29");
  assert.equal(e.access_end_date, "2026-12-31");
});

test("la spécialisation est reprise, y compris multiple", () => {
  assert.equal(
    buildEnrollment(rec({ [SRC.specialisation]: "Finance To Manage ( FICO )" })).specialty,
    "Finance To Manage ( FICO )"
  );
  // La base sépare les valeurs multiples par un point-virgule : on n'en perd aucune.
  assert.equal(
    buildEnrollment(rec({ [SRC.specialisation]: "Order To Cash ( SD );Purchase To Pay ( MM )" })).specialty,
    "Order To Cash ( SD ) · Purchase To Pay ( MM )"
  );
  assert.equal(buildEnrollment(rec({ [SRC.specialisation]: "  " })).specialty, undefined);
  assert.equal(buildEnrollment(rec({})).specialty, undefined);
});

test("le mapping reste stable sur les champs déjà en place", () => {
  const e = buildEnrollment(rec({
    [SRC.programme]: "Consultant SAP",
    [SRC.coachEmail]: "Coach.Referent@Exemple.FR",
    [SRC.avancement]: 0.72,
    [SRC.projetsValides]: 3,
    [SRC.projetsOblig]: 5,
  }));
  assert.equal(e.program, "Consultant SAP");
  assert.equal(e.coach_email, "coach.referent@exemple.fr", "e-mail normalisé en minuscules");
  assert.equal(e.progress, 0.72);
  assert.equal(e.projects_validated, 3);
  assert.equal(e.projects_required, 5);
  assert.equal(e.airtable_record_id, "recAAAAAAAAAAAAAA");
});
