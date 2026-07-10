/**
 * Navigation active-tab rule (INC-13), pure — tested off-DOM. Proves the
 * "most-specific href wins" logic so a parent tab never stays active when a more
 * specific child exists, and exactly one tab is ever active.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveActiveHref } from "../src/lib/nav-active.ts";

const staff = ["/coordination/pilotage", "/coordination/operations", "/coordination", "/coordination/apprenants", "/coordination/administration"];

test("exact match activates that tab", () => {
  assert.equal(resolveActiveHref("/coordination", staff), "/coordination");
  assert.equal(resolveActiveHref("/coordination/pilotage", staff), "/coordination/pilotage");
});

test("a nested route keeps the most specific parent tab active, not the section root", () => {
  // /coordination/apprenants/<id> must light up "Apprenants", never "/coordination" (Jurys).
  assert.equal(resolveActiveHref("/coordination/apprenants/abc-123", staff), "/coordination/apprenants");
});

test("a route under only the section root activates the root tab", () => {
  assert.equal(resolveActiveHref("/coordination/unknown-section", staff), "/coordination");
});

test("no prefix match returns undefined (no tab active)", () => {
  assert.equal(resolveActiveHref("/mon-parcours", staff), undefined);
});

test("segment boundary is respected (no false prefix match)", () => {
  // "/coordination-x" must NOT match "/coordination".
  assert.equal(resolveActiveHref("/coordination-x", ["/coordination"]), undefined);
});
