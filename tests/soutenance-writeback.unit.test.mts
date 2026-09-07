/**
 * Write-back des soutenances (INC-26) — builder pur, hors DB.
 *
 * Ce qui se joue ici : la table « Soutenances formation » est un miroir de
 * Google Agenda partagé avec l'ancien chemin Make. Une ligne mal formée n'y
 * échoue pas bruyamment — elle s'y installe et pollue un référentiel de
 * 3 065 enregistrements. D'où des tests sur la forme exacte du payload.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSoutenanceFields, type DefenseRow } from "../src/lib/sync/soutenance-writeback.ts";

const row = (over: Partial<DefenseRow> = {}): DefenseRow => ({
  id: "11111111-2222-3333-4444-555555555555",
  enrollment_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  project_number: 4,
  starts_at: "2026-09-09T08:00:00.000Z",
  ends_at: "2026-09-09T09:00:00.000Z",
  status: "pending",
  calcom_booking_id: null,
  ...over,
});
const ctx = (over = {}) => ({
  commandeRecordId: "recABCDEFGHIJKLMN",
  learnerName: "Camille Rousseau",
  learnerEmail: "camille@exemple.test",
  teamRecordIds: ["recTEAM0000000001", "recTEAM0000000002"],
  ...over,
});

test("la ligne porte le lien vers la commande et le jury", () => {
  const f = buildSoutenanceFields(row(), ctx());
  assert.deepEqual(f["Sales Orders-header"], ["recABCDEFGHIJKLMN"]);
  assert.deepEqual(f["[Master data]Team SproCLUB"], ["recTEAM0000000001", "recTEAM0000000002"]);
});

test("sans jury résolu, le champ est absent plutôt que vide", () => {
  // Envoyer un tableau vide écraserait un rattachement posé à la main côté
  // Airtable ; ne pas envoyer la clé laisse la ligne intacte.
  const f = buildSoutenanceFields(row(), ctx({ teamRecordIds: [] }));
  assert.equal("[Master data]Team SproCLUB" in f, false);
});

test("Event ID reprend l'identifiant Cal.eu quand il existe", () => {
  const avec = buildSoutenanceFields(row({ calcom_booking_id: "cal_987654" }), ctx());
  assert.equal(avec["Event ID"], "cal_987654", "s'aligne sur la clé de l'agenda");

  // Sans Cal.eu, un identifiant préfixé : la clé reste unique ET on voit d'où
  // vient la ligne.
  const sans = buildSoutenanceFields(row(), ctx());
  assert.equal(sans["Event ID"], "sproclub:11111111-2222-3333-4444-555555555555");
  assert.match(String(sans["Event ID"]), /^sproclub:/);
});

test("le statut est traduit dans le vocabulaire de l'agenda", () => {
  assert.equal(buildSoutenanceFields(row({ status: "pending" }), ctx()).Status, "tentative");
  assert.equal(buildSoutenanceFields(row({ status: "confirmed" }), ctx()).Status, "confirmed");
  assert.equal(buildSoutenanceFields(row({ status: "cancelled" }), ctx()).Status, "cancelled");
  // Un statut inattendu ne doit pas produire une valeur inventée.
  assert.equal(buildSoutenanceFields(row({ status: "quelque_chose" }), ctx()).Status, "tentative");
});

test("le titre nomme le projet et l'apprenant", () => {
  const f = buildSoutenanceFields(row(), ctx());
  assert.equal(f.Title, "Soutenance — projet 4 · Camille Rousseau");
  // Une soutenance sans numéro de projet reste titrée correctement.
  const sans = buildSoutenanceFields(row({ project_number: null }), ctx());
  assert.equal(sans.Title, "Soutenance · Camille Rousseau");
});

test("les dates partent telles quelles, sans reformatage", () => {
  // Airtable attend de l'ISO 8601 ; toute conversion locale décalerait l'heure.
  const f = buildSoutenanceFields(row(), ctx());
  assert.equal(f.Start, "2026-09-09T08:00:00.000Z");
  assert.equal(f.End, "2026-09-09T09:00:00.000Z");
});

test("la ligne dit d'où elle vient", () => {
  const f = buildSoutenanceFields(row(), ctx());
  assert.match(String(f.Description), /plateforme SproCLUB/);
  assert.equal(f.Attendees, "camille@exemple.test");
});

test("aucun champ calculé n'est écrit", () => {
  // Écrire dans un champ formule ou rollup fait échouer tout le lot Airtable.
  const f = buildSoutenanceFields(row(), ctx());
  const CALCULES = ["record ID", "Réconciliation avec table planning", "Note moyenne evaluation ( sur 4 )",
                    "Soutenance passée sans compte rendu d'évaluation", "Premier rendez vous déroulé"];
  for (const c of CALCULES) assert.equal(c in f, false, `${c} ne doit jamais être écrit`);
});
