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

// -----------------------------------------------------------------------------
// Résultat du jury et certification (2026-11-06)
//
// Quatrième défaut du même genre : le vocabulaire réel de la base n'était pas
// couvert, et une valeur inconnue devient `null` en silence. 271 commandes
// terminées portaient « Validé » ou « Non validé » et arrivaient sans résultat,
// donc l'apprenant ne voyait rien dans son portail et l'export partait vide.
// -----------------------------------------------------------------------------

test("le vocabulaire réel du jury est reconnu", () => {
  const cases: [string, string][] = [
    ["Validé", "Admis"],
    ["Non validé", "Ajourné"],
  ];
  for (const [source, expected] of cases) {
    assert.equal(
      buildEnrollment(rec({ [SRC.resultatJury]: source })).jury_result,
      expected,
      `« ${source} » devrait donner « ${expected} »`
    );
  }
});

test("« Non validé » ne devient jamais « Admis »", () => {
  // Le piège de ce champ : la négation contient le mot positif. Si l'ordre des
  // motifs s'inverse un jour, un apprenant ajourné serait affiché admis — dans
  // son propre portail, et dans l'export de reporting.
  for (const refus of ["Non validé", "non validé", "NON VALIDÉ", "Non Validé par le jury"]) {
    assert.equal(buildEnrollment(rec({ [SRC.resultatJury]: refus })).jury_result, "Ajourné", refus);
  }
});

test("l'ancien vocabulaire du jury reste reconnu", () => {
  // Les deux vocabulaires doivent coexister : la base peut encore porter
  // d'anciennes valeurs, et les reconnaître ne coûte rien.
  assert.equal(buildEnrollment(rec({ [SRC.resultatJury]: "Admis" })).jury_result, "Admis");
  assert.equal(buildEnrollment(rec({ [SRC.resultatJury]: "Ajourné" })).jury_result, "Ajourné");
  assert.equal(buildEnrollment(rec({ [SRC.resultatJury]: "En attente" })).jury_result, "En attente");
});

test("un résultat de jury inconnu reste null plutôt que deviné", () => {
  // Inventer une valeur serait pire que l'absence : on afficherait un résultat
  // de certification qu'aucun jury n'a prononcé.
  assert.equal(buildEnrollment(rec({ [SRC.resultatJury]: "Dossier incomplet" })).jury_result, undefined);
});

test("une case de certification cochée vaut « Oui »", () => {
  // `checked` : case Airtable rendue en texte par un lookup (15 commandes).
  assert.equal(buildEnrollment(rec({ [SRC.certif]: "checked" })).certification, "Oui");
  assert.equal(buildEnrollment(rec({ [SRC.certif]: true })).certification, "Oui");
  assert.equal(buildEnrollment(rec({ [SRC.certif]: "Certification SAP obtenue" })).certification, "Oui");
});

test("une certification en préparation n'est pas une certification obtenue", () => {
  assert.equal(
    buildEnrollment(rec({ [SRC.certif]: "Certification SAP en cours de préparation" })).certification,
    "En attente"
  );
});
