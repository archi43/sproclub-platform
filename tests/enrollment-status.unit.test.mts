/**
 * Statuts de dossier (INC-24) — règles pures, hors DB.
 *
 * Enjeu : le filtre `EXCLUDE_CLOSED` décide qui reçoit une relance. Une erreur
 * de logique booléenne y est invisible à la lecture et n'échoue jamais — elle
 * se traduit par des e-mails partis à des apprenants dont la commande a été
 * annulée. D'où un test sur la forme exacte du filtre.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ENROLLMENT_STATUSES, CLOSED_STATUSES, EXCLUDE_CLOSED, isClosed,
} from "../src/lib/enrollment-status.ts";

test("le vocabulaire couvre les six statuts produits par la synchronisation", () => {
  assert.deepEqual([...ENROLLMENT_STATUSES], [
    "Prêt à débuter", "En cours", "En pause", "Terminé", "Abandon", "Annulée",
  ]);
});

test("seuls « Terminé » et « Annulée » ferment un dossier", () => {
  assert.deepEqual([...CLOSED_STATUSES], ["Terminé", "Annulée"]);
  assert.equal(isClosed("Terminé"), true);
  assert.equal(isClosed("Annulée"), true);
  // Un abandon se rattrape parfois : la coordination doit continuer à le voir.
  assert.equal(isClosed("Abandon"), false);
  assert.equal(isClosed("En cours"), false);
  assert.equal(isClosed("En pause"), false);
  assert.equal(isClosed("Prêt à débuter"), false);
});

test("un statut absent n'est pas un dossier clos", () => {
  // C'est un trou de données : le masquer le rendrait invisible au lieu de le signaler.
  assert.equal(isClosed(null), false);
  assert.equal(isClosed(undefined), false);
  assert.equal(isClosed(""), false);
});

test("le filtre PostgREST groupe les exclusions dans un ET imbriqué", () => {
  // Le piège : « status.neq.Terminé,status.neq.Annulée » au premier niveau
  // signifierait « <> Terminé OU <> Annulée », toujours vrai — plus aucune
  // exclusion. Le `and(...)` est donc obligatoire dès la deuxième valeur.
  assert.equal(EXCLUDE_CLOSED, "status.is.null,and(status.neq.Terminé,status.neq.Annulée)");
  assert.ok(EXCLUDE_CLOSED.includes("and("), "les exclusions doivent être groupées");
  assert.ok(EXCLUDE_CLOSED.startsWith("status.is.null,"), "le statut nul reste inclus");
});

test("le filtre reste cohérent avec la liste des statuts clos", () => {
  // Si quelqu'un ajoute un statut clos, le filtre doit suivre tout seul.
  for (const s of CLOSED_STATUSES) {
    assert.ok(EXCLUDE_CLOSED.includes(`status.neq.${s}`), `${s} absent du filtre`);
  }
  const neqCount = (EXCLUDE_CLOSED.match(/status\.neq\./g) ?? []).length;
  assert.equal(neqCount, CLOSED_STATUSES.length, "ni oubli ni doublon");
});

test("aucun statut clos n'échappe au vocabulaire", () => {
  for (const s of CLOSED_STATUSES) {
    assert.ok((ENROLLMENT_STATUSES as readonly string[]).includes(s), `${s} inconnu`);
  }
});
