/**
 * Lecture d'agenda iCalendar (INC-19) — parseur et garde SSRF, testés hors DB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIcs, parseIcsDate, assertPublicHttpUrl } from "../src/lib/calendar/ics.ts";

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-1@example.com
DTSTART:20260908T090000Z
DTEND:20260908T100000Z
SUMMARY:Réunion équipe
END:VEVENT
BEGIN:VEVENT
UID:evt-2@example.com
DTSTART;TZID=Europe/Paris:20260908T140000
DTEND;TZID=Europe/Paris:20260908T153000
SUMMARY:Rendez-vous client
END:VEVENT
BEGIN:VEVENT
UID:evt-cancelled@example.com
DTSTART:20260908T110000Z
DTEND:20260908T120000Z
STATUS:CANCELLED
END:VEVENT
BEGIN:VEVENT
UID:evt-free@example.com
DTSTART:20260908T160000Z
DTEND:20260908T170000Z
TRANSP:TRANSPARENT
END:VEVENT
END:VCALENDAR`;

test("les événements occupants sont extraits, avec leurs bornes en UTC", () => {
  const events = parseIcs(ICS);
  assert.equal(events.length, 2, "annulé et transparent écartés");
  assert.equal(events[0].uid, "evt-1@example.com");
  assert.equal(events[0].startsAt, "2026-09-08T09:00:00.000Z");
  // 14 h à Paris en heure d'été = 12 h UTC
  assert.equal(events[1].startsAt, "2026-09-08T12:00:00.000Z");
  assert.equal(events[1].endsAt, "2026-09-08T13:30:00.000Z");
});

test("un événement annulé ou marqué disponible n'occupe pas", () => {
  const uids = parseIcs(ICS).map((e) => e.uid);
  assert.ok(!uids.includes("evt-cancelled@example.com"));
  assert.ok(!uids.includes("evt-free@example.com"));
});

test("les lignes repliées sont recollées", () => {
  const folded = `BEGIN:VEVENT
UID:long-uid-part-one
 -part-two@example.com
DTSTART:20260908T090000Z
DTEND:20260908T100000Z
END:VEVENT`;
  const [event] = parseIcs(folded);
  assert.equal(event.uid, "long-uid-part-one-part-two@example.com");
});

test("un événement sans DTEND dure une heure ; une journée entière dure un jour", () => {
  const noEnd = parseIcs(`BEGIN:VEVENT
UID:x
DTSTART:20260908T090000Z
END:VEVENT`);
  assert.equal(noEnd[0].endsAt, "2026-09-08T10:00:00.000Z");

  const allDay = parseIcs(`BEGIN:VEVENT
UID:y
DTSTART;VALUE=DATE:20260908
END:VEVENT`);
  assert.equal(allDay[0].startsAt, "2026-09-08T00:00:00.000Z");
  assert.equal(allDay[0].endsAt, "2026-09-09T00:00:00.000Z");
});

test("la fenêtre borne les événements retournés", () => {
  const events = parseIcs(ICS, {
    from: new Date("2026-09-08T11:00:00Z"),
    to: new Date("2026-09-08T23:00:00Z"),
  });
  assert.equal(events.length, 1, "le premier événement finit avant la fenêtre");
  assert.equal(events[0].uid, "evt-2@example.com");
});

test("parseIcsDate gère les trois formats", () => {
  assert.equal(parseIcsDate("20260908T090000Z")?.iso, "2026-09-08T09:00:00.000Z");
  assert.equal(parseIcsDate("20260908T140000", "Europe/Paris")?.iso, "2026-09-08T12:00:00.000Z");
  assert.equal(parseIcsDate("20261208T140000", "Europe/Paris")?.iso, "2026-12-08T13:00:00.000Z");
  assert.equal(parseIcsDate("20260908")?.allDay, true);
  assert.equal(parseIcsDate("n'importe quoi"), null);
});

test("la garde SSRF refuse le réseau interne et les schémas exotiques", () => {
  assert.ok(assertPublicHttpUrl("https://calendar.google.com/calendar/ical/x/basic.ics"));
  assert.ok(assertPublicHttpUrl("webcal://p01.calendar.icloud.com/published/x.ics"), "webcal accepté");
  for (const bad of [
    "http://localhost:3000/x.ics",
    "http://127.0.0.1/x.ics",
    "http://10.0.0.5/x.ics",
    "http://192.168.1.10/x.ics",
    "http://169.254.169.254/latest/meta-data/",
    "http://172.16.0.1/x.ics",
    "file:///etc/passwd",
    "pas une url",
  ]) {
    assert.throws(() => assertPublicHttpUrl(bad), `doit refuser ${bad}`);
  }
});
