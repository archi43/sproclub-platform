/**
 * Portail d'accueil par rôle (INC-23) — règles pures, hors DB.
 *
 * L'accueil envoyait tout compte connecté vers `/mon-parcours`, le portail
 * apprenant. Un coach, un membre du jury, la coordination ou une entreprise
 * partenaire tombaient donc sur une route que leur garde de rôle refuse.
 * Ces tests figent la correspondance et le comportement multi-rôles.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_HOME, ROLE_ORDER, homeHrefForRoles } from "../src/lib/roles.ts";

test("chaque rôle a un portail d'accueil", () => {
  for (const role of ROLE_ORDER) {
    assert.ok(ROLE_HOME[role], `${role} n'a pas de portail`);
    assert.match(ROLE_HOME[role], /^\//, `${role} : chemin relatif attendu`);
  }
  assert.equal(Object.keys(ROLE_HOME).length, ROLE_ORDER.length, "aucun rôle orphelin");
});

test("un rôle unique mène à son propre portail", () => {
  assert.equal(homeHrefForRoles(["student"]), "/mon-parcours");
  assert.equal(homeHrefForRoles(["coach"]), "/coaching");
  assert.equal(homeHrefForRoles(["evaluator"]), "/jury");
  assert.equal(homeHrefForRoles(["partner"]), "/vivier");
  assert.equal(homeHrefForRoles(["coordinator"]), "/coordination/pilotage");
  assert.equal(homeHrefForRoles(["direction"]), "/coordination/pilotage");
});

test("aucun rôle : aucun lien, plutôt qu'un lien mort", () => {
  assert.equal(homeHrefForRoles([]), null);
});

test("plusieurs rôles : le plus large décide", () => {
  // Cas réel : un coach est souvent aussi évaluateur. L'envoyer sur /jury le
  // priverait de son portefeuille.
  assert.equal(homeHrefForRoles(["evaluator", "coach"]), "/coaching");
  assert.equal(homeHrefForRoles(["coach", "evaluator"]), "/coaching", "l'ordre d'entrée n'influe pas");
  assert.equal(homeHrefForRoles(["student", "coach"]), "/coaching");
  assert.equal(homeHrefForRoles(["coordinator", "coach", "student"]), "/coordination/pilotage");
  assert.equal(homeHrefForRoles(["partner", "student"]), "/mon-parcours", "apprenant avant partenaire");
});

test("la direction prime sur tout", () => {
  assert.equal(homeHrefForRoles(["partner", "student", "coach", "direction"]), "/coordination/pilotage");
});

test("les portails staff partagent la même entrée", () => {
  assert.equal(ROLE_HOME.direction, ROLE_HOME.coordinator, "même route group, même accueil");
});
