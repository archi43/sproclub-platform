/**
 * Document content — PURE unit tests (INC-9). No database / no PDF renderer.
 * Proves each Qualiopi document carries its mandatory mentions and the right
 * dossier data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDocument,
  documentFileName,
  DOCUMENT_KINDS,
  DOCUMENT_LABELS,
  type DocumentData,
} from "../src/lib/documents/content.ts";

const data: DocumentData = {
  organizationName: "SproCLUB",
  learnerName: "Léa Test",
  learnerEmail: "lea@ex.test",
  program: "SAP FI",
  specialty: "Finance",
  financer: "CPF",
  startDate: "2026-01-06",
  endDate: "2026-06-30",
  issuedOn: "2026-07-09",
  defenseDate: "2026-06-20 14:00",
};

test("every kind builds a titled document with body and footer", () => {
  for (const kind of DOCUMENT_KINDS) {
    const doc = buildDocument(kind, data);
    assert.equal(doc.title, DOCUMENT_LABELS[kind]);
    assert.ok(doc.body.length >= 3, `${kind} has a body`);
    assert.ok(doc.footer.length >= 1, `${kind} has a footer`);
    // Dossier data is present in every document.
    const text = [...doc.body, ...doc.footer].join(" ");
    assert.ok(text.includes("SproCLUB"), `${kind} names the organism`);
    assert.ok(text.includes("Léa Test"), `${kind} names the learner`);
    assert.ok(text.includes("SAP FI"), `${kind} names the program`);
    assert.ok(text.includes("2026-07-09"), `${kind} is dated`);
  }
});

test("attestations carry the mandatory legal mention", () => {
  const entry = buildDocument("attestation_entree", data);
  assert.ok(entry.footer.join(" ").includes("L. 6353-1"), "entry attestation cites L.6353-1");
  assert.ok(entry.body.join(" ").includes("du 2026-01-06 au 2026-06-30"), "entry attestation states the period");

  const end = buildDocument("attestation_fin", data);
  assert.ok(end.footer.join(" ").includes("L. 6353-1"));

  const conv = buildDocument("convention", data);
  assert.ok(conv.footer.join(" ").includes("L. 6353-2"), "convention cites L.6353-2");
});

test("convocation states the defense date", () => {
  const doc = buildDocument("convocation_soutenance", data);
  assert.ok(doc.body.join(" ").includes("2026-06-20 14:00"));
});

test("missing optional data degrades to a dash, not a crash", () => {
  const bare = buildDocument("attestation_entree", { ...data, program: null, specialty: null, financer: null, startDate: null, endDate: null });
  const text = bare.body.join(" ");
  assert.ok(text.includes("—"), "missing fields render as a dash");
});

test("file name is path-safe and dated", () => {
  assert.equal(documentFileName("convention", "2026-07-09"), "convention-2026-07-09.pdf");
  assert.ok(!documentFileName("convention", "2026-07-09").includes("/"));
});
