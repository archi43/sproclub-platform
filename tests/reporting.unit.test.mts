/**
 * Reporting (Module 5) — PURE unit tests (INC-6). No database, always runs.
 * Covers segmentation, CSV serialization/escaping, and the year helper.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  segmentBy,
  reportYears,
  yearOf,
  csvEscape,
  toCsv,
  exportRowValues,
  EXPORT_HEADERS,
  type ReportRow,
  type ExportRow,
} from "../src/lib/reporting-rules.ts";

const row = (over: Partial<ReportRow>): ReportRow => ({
  status: "En cours", certification: null, global_grade: null, insertion_situation: null,
  satisfaction_score: null, nps: null, attestation_entry_sent: null, convention_signed: null,
  pending_reports: null, program: null, specialty: null, financer: null, start_date: null, ...over,
});

test("segmentBy groups by the dimension, largest first, and computes KPIs", () => {
  const rows = [
    row({ program: "SAP", status: "Terminé", certification: "Oui" }),
    row({ program: "SAP", status: "En cours" }),
    row({ program: "Odoo", status: "Terminé", certification: "Non" }),
  ];
  const segs = segmentBy(rows, "program");
  assert.deepEqual(segs.map((s) => s.key), ["SAP", "Odoo"], "SAP (2) before Odoo (1)");
  assert.equal(segs[0].kpis.total, 2);
  assert.deepEqual(segs[0].kpis.certification, { value: 1, n: 1 }, "SAP: 1/1 certified attempts");
  assert.equal(segs[1].kpis.certification?.value, 0, "Odoo: 0/1 certified");
});

test("null dimension values collapse into '—'", () => {
  const segs = segmentBy([row({ financer: null }), row({ financer: "CPF" })], "financer");
  assert.ok(segs.some((s) => s.key === "—"));
  assert.ok(segs.some((s) => s.key === "CPF"));
});

test("yearOf / reportYears extract start-date years, recent first", () => {
  assert.equal(yearOf("2026-07-09"), "2026");
  assert.equal(yearOf(null), null);
  const years = reportYears([row({ start_date: "2025-01-02" }), row({ start_date: "2026-03-04" }), row({ start_date: null })]);
  assert.deepEqual(years, ["2026", "2025"]);
});

test("csvEscape quotes only when needed (RFC-4180)", () => {
  assert.equal(csvEscape("simple"), "simple");
  assert.equal(csvEscape("a,b"), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape("line\nbreak"), '"line\nbreak"');
  assert.equal(csvEscape(null), "");
  assert.equal(csvEscape(42), "42");
});

test("csvEscape neutralizes spreadsheet formula injection in text cells", () => {
  assert.equal(csvEscape("=SUM(A1:A9)"), "'=SUM(A1:A9)");
  assert.equal(csvEscape("+1"), "'+1");
  assert.equal(csvEscape("@cmd"), "'@cmd");
  assert.equal(csvEscape("-danger,x"), '"\'-danger,x"', "guard applied then quoted for the comma");
  assert.equal(csvEscape(-5), "-5", "a numeric value is never prefixed");
});

test("toCsv emits header + rows with CRLF", () => {
  const csv = toCsv(["A", "B"], [[1, "x,y"], ["z", null]]);
  assert.equal(csv, 'A,B\r\n1,"x,y"\r\nz,');
});

test("exportRowValues matches the header arity and formats progress as %", () => {
  const e: ExportRow = { ...row({ program: "SAP", start_date: "2026-01-01", certification: "Oui" }), learnerName: "Léa T", email: "lea@ex.test", progress: 0.42, jury_result: "Admis" };
  const values = exportRowValues(e);
  assert.equal(values.length, EXPORT_HEADERS.length, "one value per header column");
  assert.equal(values[0], "Léa T");
  assert.equal(values[7], 42, "progress rendered as percentage integer");
});
