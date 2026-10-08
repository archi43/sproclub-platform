/**
 * Accès et rôles depuis Airtable (INC-29) — règles pures, hors DB.
 *
 * Ces tests valent garde-fou d'exploitation autant que test unitaire : la
 * fonction testée décide d'ouvrir et de **couper** des accès sur 103 personnes
 * à chaque passage de synchronisation. Une erreur de raisonnement ici enferme
 * tout le monde dehors, ou laisse un accès ouvert après la fin d'un contrat.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAppRole,
  normalizeEmail,
  decideAccessSync,
  summarizePlan,
  type CurrentMembership,
  type DesiredAccess,
} from "../src/lib/access-rules.ts";
import { MANUAL_INVITE_ROLES } from "../src/lib/roles.ts";
import { SYNCED_ROLES } from "../src/lib/access-rules.ts";

const hab = (over: Partial<DesiredAccess> = {}): DesiredAccess => ({
  habilitationId: "recHab1",
  email: "pierre@example.org",
  fullName: "Pierre Martin",
  roleLabel: "Apprenant",
  ...over,
});

const member = (over: Partial<CurrentMembership> = {}): CurrentMembership => ({
  profileId: "prof-1",
  email: "pierre@example.org",
  role: "student",
  source: "airtable",
  habilitationId: "recHab1",
  deactivated: false,
  ...over,
});

const kinds = (plan: { actions: { kind: string }[] }) => plan.actions.map((a) => a.kind);

// -----------------------------------------------------------------------------
// Normalisation
// -----------------------------------------------------------------------------

test("les libellés Airtable se rapprochent sans accent ni casse", () => {
  assert.equal(normalizeAppRole("Apprenant"), "student");
  assert.equal(normalizeAppRole("Coach"), "coach");
  assert.equal(normalizeAppRole("Évaluateur"), "evaluator");
  // Saisi sans accent par inadvertance : même rôle, pas un rôle perdu.
  assert.equal(normalizeAppRole("Evaluateur"), "evaluator");
  assert.equal(normalizeAppRole("  DIRECTION "), "direction");
  assert.equal(normalizeAppRole("Coordination"), "coordinator");
});

test("un rôle inconnu vaut null, il n'est jamais rapproché au hasard", () => {
  // Le piège d'INC-24 : une valeur inconnue devenue `null` en silence avait
  // sorti 41 dossiers de tous les compteurs. Ici elle doit être visible.
  for (const bad of ["Stagiaire", "Fournisseur", "", null, undefined, "partner"]) {
    assert.equal(normalizeAppRole(bad), null, `${bad} ne devrait pas être reconnu`);
  }
});

test("l'entreprise partenaire n'est pas un rôle synchronisé", () => {
  // Un compte partenaire exige un rattachement à une société que la table
  // Habilitations ne porte pas : il reste créé dans la plateforme.
  assert.equal(normalizeAppRole("Entreprise partenaire"), null);
});

test("un e-mail inexploitable vaut null", () => {
  for (const bad of ["", "   ", "pierre", "@example.org", "pierre@", null, undefined]) {
    assert.equal(normalizeEmail(bad), null, `${bad} ne devrait pas passer`);
  }
  assert.equal(normalizeEmail("  Pierre@Example.ORG "), "pierre@example.org");
});

// -----------------------------------------------------------------------------
// Le plan : ouverture d'accès
// -----------------------------------------------------------------------------

test("une habilitation sans compte existant crée le compte", () => {
  const plan = decideAccessSync([hab()], []);
  assert.deepEqual(kinds(plan), ["create"]);
  const action = plan.actions[0];
  assert.equal(action.kind === "create" && action.role, "student");
  assert.equal(action.kind === "create" && action.habilitationId, "recHab1");
});

test("une personne déjà connue reçoit le rôle sans recréer de compte", () => {
  // Un coach devient aussi évaluateur : on ajoute le rôle, on ne fabrique pas
  // un second compte pour la même adresse.
  const plan = decideAccessSync(
    [
      // Les deux habilitations coexistent dans le back office : le rôle de coach
      // est conservé, celui d'évaluateur s'ajoute.
      hab({ habilitationId: "recHab1", roleLabel: "Coach" }),
      hab({ habilitationId: "recHab2", roleLabel: "Évaluateur" }),
    ],
    [member({ role: "coach", habilitationId: "recHab1" })]
  );
  assert.deepEqual(kinds(plan), ["grant"]);
  const action = plan.actions[0];
  assert.equal(action.kind === "grant" && action.profileId, "prof-1");
  assert.equal(action.kind === "grant" && action.role, "evaluator");
});

test("une habilitation redevenue effective lève la désactivation", () => {
  const plan = decideAccessSync([hab()], [member({ deactivated: true })]);
  assert.deepEqual(kinds(plan), ["reactivate"]);
});

test("un accès déjà en place et actif ne produit aucune action", () => {
  // Le passage tourne toutes les 15 minutes : l'inaction doit être silencieuse,
  // sinon le journal devient illisible et masque les vraies décisions.
  const plan = decideAccessSync([hab()], [member()]);
  assert.deepEqual(plan.actions, []);
});

// -----------------------------------------------------------------------------
// Le plan : coupure d'accès
// -----------------------------------------------------------------------------

test("une habilitation qui disparaît coupe l'accès", () => {
  const plan = decideAccessSync([], [member()]);
  assert.deepEqual(kinds(plan), ["deactivate"]);
  const action = plan.actions[0];
  assert.equal(action.kind === "deactivate" && action.profileId, "prof-1");
});

test("une ligne déjà désactivée n'est pas désactivée deux fois", () => {
  const plan = decideAccessSync([], [member({ deactivated: true })]);
  assert.deepEqual(plan.actions, []);
});

test("un compte de service n'est jamais coupé par la synchronisation", () => {
  // Invariant d'exploitation : le compte de direction de la plateforme n'est pas
  // dans Airtable. Sans cette règle, le premier passage nous enfermerait dehors.
  const plan = decideAccessSync(
    [],
    [
      member({ profileId: "prof-dir", email: "direction@sproclub.com", role: "direction", source: "manual", habilitationId: null }),
      member({ profileId: "prof-coord", email: "coord@sproclub.com", role: "coordinator", source: "manual", habilitationId: null }),
    ]
  );
  assert.deepEqual(plan.actions, []);
});

test("un compte de service que désigne aussi Airtable reste hors périmètre", () => {
  // Les deux sources décrivent la même personne : on trace, et on laisse la
  // ligne manuelle intacte plutôt que d'en créer une seconde.
  const plan = decideAccessSync(
    [hab({ email: "coord@sproclub.com", roleLabel: "Coordination" })],
    [member({ email: "coord@sproclub.com", role: "coordinator", source: "manual", habilitationId: null })]
  );
  assert.deepEqual(kinds(plan), ["skip"]);
  const action = plan.actions[0];
  assert.match(action.kind === "skip" ? action.reason : "", /compte de service/);
});

test("le dernier compte de direction actif ne peut pas être coupé", () => {
  // Le trigger trg_last_direction (0012) refuserait de toute façon, service-role
  // inclus : l'anticiper évite une exception à chaque passage, et trace le refus.
  const plan = decideAccessSync(
    [],
    [member({ profileId: "prof-dir", email: "dir@sproclub.com", role: "direction" })]
  );
  assert.deepEqual(kinds(plan), ["skip"]);
  const action = plan.actions[0];
  assert.match(action.kind === "skip" ? action.reason : "", /dernier compte de direction/);
});

test("l'avant-dernière direction peut être coupée, pas la dernière", () => {
  const plan = decideAccessSync(
    [],
    [
      member({ profileId: "prof-a", email: "a@sproclub.com", role: "direction", habilitationId: "recA" }),
      member({ profileId: "prof-b", email: "b@sproclub.com", role: "direction", habilitationId: "recB" }),
    ]
  );
  // Une seule coupure, et un refus explicite pour celle qui resterait seule.
  assert.deepEqual(kinds(plan).sort(), ["deactivate", "skip"]);
});

// -----------------------------------------------------------------------------
// Entrées inexploitables : tracées, jamais avalées
// -----------------------------------------------------------------------------

test("un contact sans e-mail est tracé plutôt qu'ignoré", () => {
  const plan = decideAccessSync([hab({ email: null })], []);
  assert.deepEqual(kinds(plan), ["skip"]);
  const action = plan.actions[0];
  assert.match(action.kind === "skip" ? action.reason : "", /sans e-mail/);
});

test("un rôle non reconnu est tracé avec sa valeur source", () => {
  const plan = decideAccessSync([hab({ roleLabel: "Stagiaire" })], []);
  assert.deepEqual(kinds(plan), ["skip"]);
  const action = plan.actions[0];
  assert.match(action.kind === "skip" ? action.reason : "", /Stagiaire/);
});

test("deux habilitations pour le même couple personne/rôle ne créent qu'un accès", () => {
  // Contrainte d'unicité (org_id, profile_id, role) en base : sans ce
  // dédoublonnage, le second insert échouerait à chaque passage.
  const plan = decideAccessSync([hab(), hab({ habilitationId: "recHab2" })], []);
  assert.deepEqual(kinds(plan), ["create", "skip"]);
  const skipped = plan.actions[1];
  assert.match(skipped.kind === "skip" ? skipped.reason : "", /doublon/);
});

test("le plan est stable : mêmes entrées, même plan", () => {
  // Auditabilité : la décision doit se rejouer à l'identique pour justifier une
  // coupure d'accès contestée.
  const desired = [hab(), hab({ habilitationId: "recHab2", email: "autre@example.org", roleLabel: "Coach" })];
  const current = [member({ profileId: "prof-x", email: "parti@example.org", role: "coach" })];
  assert.deepEqual(decideAccessSync(desired, current), decideAccessSync(desired, current));
});

test("le décompte du plan alimente le journal d'exploitation", () => {
  const plan = decideAccessSync(
    [hab(), hab({ habilitationId: "recHab2", roleLabel: "Stagiaire" })],
    [member({ profileId: "prof-y", email: "parti@example.org", role: "coach", habilitationId: "recOld" })]
  );
  const summary = summarizePlan(plan);
  assert.equal(summary.skip, 1);
  assert.equal(summary.deactivate, 1);
  assert.equal(summary.create + summary.grant, 1);
});

test("un droit à l'effacement exercé n'est jamais défait par la synchronisation", () => {
  // L'habilitation reste effective dans l'annuaire : sans ce garde, le passage
  // suivant recréerait le compte et son adresse, annulant l'effacement.
  const plan = decideAccessSync([hab()], [], { erasedEmails: ["PIERRE@example.org"] });
  assert.deepEqual(kinds(plan), ["skip"]);
  const action = plan.actions[0];
  assert.match(action.kind === "skip" ? action.reason : "", /effacement/);
});

test("la liste de suppression se compare sans tenir compte de la casse", () => {
  // Les adresses de `data_erasures` viennent d'une autre source : une
  // comparaison sensible à la casse laisserait passer l'effacement.
  const plan = decideAccessSync(
    [hab({ email: "Pierre@Example.ORG" })],
    [],
    { erasedEmails: ["pierre@example.org"] }
  );
  assert.deepEqual(kinds(plan), ["skip"]);
});

// -----------------------------------------------------------------------------
// Cohérence des deux listes de rôles
// -----------------------------------------------------------------------------

test("les rôles de terrain ne sont jamais attribuables à la main", () => {
  // L'invariant du « terme logique » d'INC-29 : apprenant, coach et évaluateur
  // naissent d'une habilitation. Les rendre créables à l'écran rétablirait la
  // double saisie, et la ligne créée serait de provenance manuelle, donc jamais
  // coupée à l'expiration de l'habilitation : un accès ouvert à vie.
  for (const role of ["student", "coach", "evaluator"]) {
    assert.ok(
      !(MANUAL_INVITE_ROLES as readonly string[]).includes(role),
      `${role} ne doit pas être attribuable depuis l'écran Administration`
    );
  }
});

test("le pilotage reste attribuable à la main, même s'il est synchronisable", () => {
  // Chevauchement assumé, et c'est le garde-fou d'exploitation : direction et
  // coordination peuvent venir d'Airtable, mais doivent aussi pouvoir être créés
  // comme comptes de service — sinon un incident sur l'annuaire rendrait la
  // plateforme inadministrable.
  for (const role of ["direction", "coordinator"]) {
    assert.ok((MANUAL_INVITE_ROLES as readonly string[]).includes(role), `${role} doit rester créable`);
    assert.ok((SYNCED_ROLES as readonly string[]).includes(role), `${role} doit rester synchronisable`);
  }
});

test("les cinq rôles internes sont couverts par la synchronisation", () => {
  // Si un rôle n'est ni synchronisé ni attribuable à la main, personne ne peut
  // plus l'attribuer : la fonctionnalité correspondante devient inaccessible.
  const all = ["direction", "coordinator", "coach", "evaluator", "student", "partner"];
  const covered = new Set<string>([...SYNCED_ROLES, ...MANUAL_INVITE_ROLES]);
  for (const role of all) {
    assert.ok(covered.has(role), `le rôle ${role} n'est attribuable par aucun chemin`);
  }
});
