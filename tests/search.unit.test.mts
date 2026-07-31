/**
 * Recherche d'apprenant (INC-21) — assainissement du terme, hors DB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeSearchTerm, buildIlikeOr, MAX_SEARCH_LENGTH } from "../src/lib/search-rules.ts";

test("un terme normal passe tel quel", () => {
  assert.equal(sanitizeSearchTerm("Dupont"), "Dupont");
  assert.equal(sanitizeSearchTerm("  marie.curie@exemple.fr  "), "marie.curie@exemple.fr");
  assert.equal(sanitizeSearchTerm("Jean Pierre"), "Jean Pierre");
});

test("rien à chercher renvoie null, jamais une chaîne vide", () => {
  assert.equal(sanitizeSearchTerm(""), null);
  assert.equal(sanitizeSearchTerm("   "), null);
  assert.equal(sanitizeSearchTerm(null), null);
  assert.equal(sanitizeSearchTerm(undefined), null);
  assert.equal(sanitizeSearchTerm("a"), null, "un seul caractère : trop court");
});

test("les caractères qui altèrent le filtre PostgREST sont neutralisés", () => {
  // Une virgule fermerait la condition et en ouvrirait une autre.
  assert.equal(sanitizeSearchTerm("Dupont,email.ilike.*"), "Dupont email.ilike.");
  assert.equal(sanitizeSearchTerm('X" or "1"="1'), "X or 1 = 1", "guillemets neutralisés");
  assert.equal(sanitizeSearchTerm("a)or(b"), "a or b");
});

test("les jokers LIKE ne peuvent pas être forgés", () => {
  assert.equal(sanitizeSearchTerm("%"), null, "un joker seul ne laisse rien");
  assert.equal(sanitizeSearchTerm("Du%pont"), "Du pont");
  assert.equal(sanitizeSearchTerm("a_b"), "a b");
});

test("le terme est borné en longueur", () => {
  const long = "x".repeat(200);
  assert.equal(sanitizeSearchTerm(long)!.length, MAX_SEARCH_LENGTH);
});

test("buildIlikeOr couvre chaque colonne demandée", () => {
  assert.equal(
    buildIlikeOr("Dupont", ["first_name", "last_name", "email"]),
    "first_name.ilike.%Dupont%,last_name.ilike.%Dupont%,email.ilike.%Dupont%"
  );
});
