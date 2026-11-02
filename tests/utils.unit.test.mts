/**
 * `cn()` — fusion de classes Tailwind.
 *
 * Fige un défaut constaté pendant la migration au design system SproClub :
 * `tailwind-merge` prenait les tailles du thème (`text-label`, `text-figure`)
 * pour des couleurs et les supprimait dès qu'une couleur suivait. Les tuiles de
 * synthèse affichaient alors leurs chiffres à la taille du texte courant.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cn } from "../src/lib/utils.ts";

test("une taille du thème survit à une couleur qui la suit", () => {
  assert.equal(cn("text-label", "text-muted"), "text-label text-muted");
  assert.equal(cn("text-figure font-bold", "text-brand"), "text-figure font-bold text-brand");
  assert.equal(cn("text-figure-lg", "text-error"), "text-figure-lg text-error");
});

test("deux tailles restent en conflit : la dernière l'emporte", () => {
  assert.equal(cn("text-sm", "text-figure"), "text-figure");
  assert.equal(cn("text-label", "text-xs"), "text-xs");
});

test("deux couleurs restent en conflit : la dernière l'emporte", () => {
  assert.equal(cn("text-brand", "text-error"), "text-error");
});
