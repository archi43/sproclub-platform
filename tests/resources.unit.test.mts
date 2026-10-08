/**
 * Accès aux ressources (INC-30) — règles pures, hors DB.
 *
 * La règle la plus sensible est `canRevealPassword` : elle décide si un secret
 * partagé (un compte serveur SAP réaffecté d'apprenant en apprenant) sort de la
 * plateforme. Ses bornes sont donc testées au jour près.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assignmentStatus,
  canRevealPassword,
  planResourceAssignments,
  staleAssignmentIds,
  sortForDisplay,
  type PlanInput,
  type SourceAssignment,
} from "../src/lib/resource-rules.ts";

test("statut : bornes incluses, au jour près", () => {
  assert.equal(assignmentStatus("2026-10-01", "2026-10-31", "2026-09-30"), "upcoming");
  assert.equal(assignmentStatus("2026-10-01", "2026-10-31", "2026-10-01"), "active");
  assert.equal(assignmentStatus("2026-10-01", "2026-10-31", "2026-10-31"), "active");
  assert.equal(assignmentStatus("2026-10-01", "2026-10-31", "2026-11-01"), "expired");
});

test("statut : une borne absente est ouverte", () => {
  assert.equal(assignmentStatus(null, null, "2026-10-08"), "active");
  assert.equal(assignmentStatus(null, "2026-10-07", "2026-10-08"), "expired");
  assert.equal(assignmentStatus("2026-10-09", null, "2026-10-08"), "upcoming");
});

test("statut : une date du jour mal formée est refusée, pas interprétée", () => {
  assert.throws(() => assignmentStatus(null, null, "08/10/2026"));
});

test("mot de passe : seulement pendant la période de validité", () => {
  assert.equal(canRevealPassword("active"), true);
  assert.equal(canRevealPassword("upcoming"), false);
  assert.equal(canRevealPassword("expired"), false);
});

const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  assignments: [],
  resources: [
    { recordId: "recRes1", label: " P2W71894059-07 ", typeId: "recTypeS4" },
    { recordId: "recRes2", label: "LHUB-12", typeId: null },
    { recordId: "recResVide", label: "  ", typeId: null },
  ],
  types: [{ recordId: "recTypeS4", name: "Serveur SAP S/4HANA", category: "Serveur SAP" }],
  enrollmentByCommande: new Map([["recCmd1", "enr-1"], ["recCmdEff", "enr-eff"]]),
  erasedEnrollments: new Set(["enr-eff"]),
  ...over,
});

const assignment = (over: Partial<SourceAssignment> = {}): SourceAssignment => ({
  recordId: "recAff1",
  commandeId: "recCmd1",
  resourceIds: ["recRes1"],
  startsOn: "2026-10-01",
  endsOn: "2026-12-31",
  ...over,
});

test("plan : une affectation complète devient une ligne, type résolu, libellé nettoyé", () => {
  const plan = planResourceAssignments(base({ assignments: [assignment()] }));
  assert.deepEqual(plan.rows, [{
    airtable_record_id: "recAff1",
    airtable_resource_id: "recRes1",
    enrollment_id: "enr-1",
    resource_label: "P2W71894059-07",
    resource_type: "Serveur SAP S/4HANA",
    resource_category: "Serveur SAP",
    starts_on: "2026-10-01",
    ends_on: "2026-12-31",
  }]);
});

test("plan : une affectation à plusieurs comptes donne une ligne par compte", () => {
  const plan = planResourceAssignments(base({ assignments: [assignment({ resourceIds: ["recRes1", "recRes2"] })] }));
  assert.equal(plan.rows.length, 2);
  assert.equal(plan.rows[1].resource_type, null, "compte sans type : type vide, pas inventé");
});

test("plan : chaque affectation écartée l'est avec un motif, rien ne disparaît en silence", () => {
  const plan = planResourceAssignments(base({
    assignments: [
      assignment({ recordId: "a", commandeId: null }),
      assignment({ recordId: "b", commandeId: "recCmdInconnue" }),
      assignment({ recordId: "c", commandeId: "recCmdEff" }),
      assignment({ recordId: "d", resourceIds: [] }),
      assignment({ recordId: "e", resourceIds: ["recResAbsent"] }),
      assignment({ recordId: "f", resourceIds: ["recResVide"] }),
    ],
  }));
  assert.equal(plan.rows.length, 0);
  assert.deepEqual(plan.skipped, {
    "no-commande": 1,
    "unknown-enrollment": 1,
    erased: 1,
    "no-resource": 1,
    "unknown-resource": 2,
  });
});

test("plan : un apprenant effacé (RGPD) ne réapparaît pas par ses accès", () => {
  const plan = planResourceAssignments(base({ assignments: [assignment({ commandeId: "recCmdEff" })] }));
  assert.equal(plan.rows.length, 0);
});

test("plan : une date mal formée devient une borne ouverte plutôt qu'une erreur d'insertion", () => {
  const plan = planResourceAssignments(base({ assignments: [assignment({ startsOn: "bientôt" })] }));
  assert.equal(plan.rows[0].starts_on, null);
});

test("lignes périmées : seules celles que la source ne porte plus", () => {
  const plan = planResourceAssignments(base({ assignments: [assignment()] }));
  const stale = staleAssignmentIds([
    { id: "keep", airtable_record_id: "recAff1", airtable_resource_id: "recRes1" },
    { id: "drop-compte", airtable_record_id: "recAff1", airtable_resource_id: "recRes2" },
    { id: "drop-affectation", airtable_record_id: "recAffSupprimee", airtable_resource_id: "recRes1" },
  ], plan.rows);
  assert.deepEqual(stale, ["drop-compte", "drop-affectation"]);
});

test("affichage : en cours, puis à venir, puis expirés ; fin la plus proche d'abord", () => {
  const sorted = sortForDisplay([
    { id: "exp", status: "expired" as const, endsOn: "2026-09-01" },
    { id: "act-tard", status: "active" as const, endsOn: "2027-01-31" },
    { id: "venir", status: "upcoming" as const, endsOn: "2027-03-01" },
    { id: "act-tot", status: "active" as const, endsOn: "2026-10-31" },
    { id: "act-sans-fin", status: "active" as const, endsOn: null },
  ]);
  assert.deepEqual(sorted.map((s) => s.id), ["act-tot", "act-tard", "act-sans-fin", "venir", "exp"]);
});
