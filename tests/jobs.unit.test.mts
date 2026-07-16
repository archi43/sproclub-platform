/**
 * Jobboard (INC-18) — machine à états de modération, testée hors DB.
 * Doit refléter EXACTEMENT le trigger protect_job_offer_moderation (0026).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, allowedTransitions, canEditContent } from "../src/lib/job-rules.ts";

test("seule la coordination publie ou rejette une offre en attente", () => {
  assert.ok(canTransition("staff", "pending", "published"));
  assert.ok(canTransition("staff", "pending", "rejected"));
  assert.ok(!canTransition("partner", "pending", "published"), "un partenaire ne se publie jamais");
  assert.ok(!canTransition("partner", "pending", "rejected"));
});

test("le partenaire re-soumet une offre rejetée et archive la sienne", () => {
  assert.ok(canTransition("partner", "rejected", "pending"), "re-soumission après rejet");
  assert.ok(canTransition("partner", "published", "archived"));
  assert.ok(canTransition("partner", "pending", "archived"));
  assert.ok(!canTransition("partner", "archived", "published"), "republier reste une décision staff");
});

test("la coordination peut dépublier et republier", () => {
  assert.ok(canTransition("staff", "published", "archived"));
  assert.ok(canTransition("staff", "rejected", "published"));
  assert.ok(canTransition("staff", "archived", "published"));
});

test("allowedTransitions liste les cibles valides par acteur", () => {
  assert.deepEqual(allowedTransitions("staff", "pending").sort(), ["published", "rejected"]);
  assert.deepEqual(allowedTransitions("partner", "rejected"), ["pending"]);
  assert.deepEqual(allowedTransitions("partner", "archived"), []);
});

test("le partenaire n'édite le contenu que tant que non publié", () => {
  assert.ok(canEditContent("partner", "pending"));
  assert.ok(canEditContent("partner", "rejected"));
  assert.ok(!canEditContent("partner", "published"), "une offre publiée ne se modifie pas sans re-modération");
  assert.ok(canEditContent("staff", "published"), "la coordination garde la main");
});
