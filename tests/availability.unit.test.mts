/**
 * Disponibilités déclarées (INC-19) — génération des créneaux, testée hors DB.
 * Couvre : récurrence, fenêtre de validité, ouverture exceptionnelle, priorité
 * de la fermeture, occupations d'agenda, passé écarté, et changement d'heure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateSlots,
  localToUtc,
  weekdayOf,
  filterBookableSlots,
  type AvailabilityRule,
} from "../src/lib/availability-rules.ts";

// Mardi 8 septembre 2026 (heure d'été à Paris → UTC+2).
const TUESDAY = "2026-09-08";
const NOW = new Date("2026-09-01T00:00:00Z");

const coachingTuesday: AvailabilityRule = {
  kind: "coaching",
  weekday: 2, // mardi
  startTime: "14:00",
  endTime: "17:00",
  slotMinutes: 60,
};

test("une plage récurrente produit un créneau par tranche, à l'heure locale", () => {
  const slots = generateSlots({
    rules: [coachingTuesday],
    from: TUESDAY,
    to: TUESDAY,
    kind: "coaching",
    now: NOW,
  });
  assert.equal(slots.length, 3, "14-17 h en tranches d'une heure");
  // Heure d'été : 14 h à Paris = 12 h UTC.
  assert.equal(slots[0].startsAt, "2026-09-08T12:00:00.000Z");
  assert.equal(slots[2].endsAt, "2026-09-08T15:00:00.000Z");
});

test("la récurrence ne sort que le bon jour de semaine et le bon type", () => {
  const week = generateSlots({
    rules: [coachingTuesday],
    from: "2026-09-07",
    to: "2026-09-13",
    kind: "coaching",
    now: NOW,
  });
  assert.equal(week.length, 3, "un seul mardi dans la semaine");

  const otherKind = generateSlots({
    rules: [coachingTuesday],
    from: TUESDAY,
    to: TUESDAY,
    kind: "defense",
    now: NOW,
  });
  assert.equal(otherKind.length, 0, "une plage de coaching n'ouvre pas de soutenance");
});

test("la fenêtre de validité borne la récurrence", () => {
  const expired = generateSlots({
    rules: [{ ...coachingTuesday, validTo: "2026-09-01" }],
    from: TUESDAY,
    to: TUESDAY,
    kind: "coaching",
    now: NOW,
  });
  assert.equal(expired.length, 0, "règle expirée");

  const notYet = generateSlots({
    rules: [{ ...coachingTuesday, validFrom: "2026-10-01" }],
    from: TUESDAY,
    to: TUESDAY,
    kind: "coaching",
    now: NOW,
  });
  assert.equal(notYet.length, 0, "règle pas encore en vigueur");

  const inactive = generateSlots({
    rules: [{ ...coachingTuesday, active: false }],
    from: TUESDAY,
    to: TUESDAY,
    kind: "coaching",
    now: NOW,
  });
  assert.equal(inactive.length, 0, "règle désactivée");
});

test("une fermeture l'emporte sur la récurrence ET sur une ouverture", () => {
  const slots = generateSlots({
    rules: [coachingTuesday],
    blocks: [
      // Ferme 14-15 h locales (12-13 h UTC)
      { kind: null, effect: "closed", startsAt: "2026-09-08T12:00:00.000Z", endsAt: "2026-09-08T13:00:00.000Z" },
      // Ouvre une plage qui tombe dans la fermeture → doit rester fermée
      { kind: "coaching", effect: "open", startsAt: "2026-09-08T12:00:00.000Z", endsAt: "2026-09-08T13:00:00.000Z", slotMinutes: 60 },
    ],
    from: TUESDAY,
    to: TUESDAY,
    kind: "coaching",
    now: NOW,
  });
  assert.equal(slots.length, 2, "le premier créneau est retiré");
  assert.equal(slots[0].startsAt, "2026-09-08T13:00:00.000Z");
});

test("une ouverture exceptionnelle crée un créneau hors récurrence", () => {
  const slots = generateSlots({
    rules: [],
    blocks: [
      { kind: "defense", effect: "open", startsAt: "2026-09-10T08:00:00.000Z", endsAt: "2026-09-10T09:30:00.000Z", slotMinutes: 90 },
    ],
    from: "2026-09-10",
    to: "2026-09-10",
    kind: "defense",
    now: NOW,
  });
  assert.equal(slots.length, 1);
  assert.equal(slots[0].endsAt, "2026-09-10T09:30:00.000Z");
});

test("une occupation d'agenda externe masque le créneau qui la chevauche", () => {
  const slots = generateSlots({
    rules: [coachingTuesday],
    busy: [{ startsAt: "2026-09-08T13:30:00.000Z", endsAt: "2026-09-08T14:15:00.000Z" }],
    from: TUESDAY,
    to: TUESDAY,
    kind: "coaching",
    now: NOW,
  });
  // Chevauche 15-16 h et 16-17 h locales → il ne reste que 14-15 h.
  assert.equal(slots.length, 1);
  assert.equal(slots[0].startsAt, "2026-09-08T12:00:00.000Z");
});

test("les créneaux passés ne sont jamais publiés", () => {
  const slots = generateSlots({
    rules: [coachingTuesday],
    from: TUESDAY,
    to: TUESDAY,
    kind: "coaching",
    now: new Date("2026-09-08T13:30:00.000Z"), // 15 h 30 locales
  });
  assert.equal(slots.length, 1, "seul le créneau 16-17 h reste");
  assert.equal(slots[0].startsAt, "2026-09-08T14:00:00.000Z");
});

test("une tranche incomplète en fin de plage est ignorée", () => {
  const slots = generateSlots({
    rules: [{ ...coachingTuesday, endTime: "16:30" }],
    from: TUESDAY,
    to: TUESDAY,
    kind: "coaching",
    now: NOW,
  });
  assert.equal(slots.length, 2, "14-15 et 15-16 ; la demi-heure restante est écartée");
});

test("le changement d'heure ne décale pas l'heure locale déclarée", () => {
  // Dernier mardi d'octobre 2026 : le 27, après le retour à l'heure d'hiver (25/10).
  const winter = generateSlots({
    rules: [coachingTuesday],
    from: "2026-10-27",
    to: "2026-10-27",
    kind: "coaching",
    now: NOW,
  });
  // 14 h à Paris = 13 h UTC en hiver (contre 12 h UTC en été).
  assert.equal(winter[0].startsAt, "2026-10-27T13:00:00.000Z");
});

test("les fonctions de fuseau sont cohérentes", () => {
  assert.equal(localToUtc("2026-09-08", "14:00").toISOString(), "2026-09-08T12:00:00.000Z");
  assert.equal(localToUtc("2026-12-08", "14:00").toISOString(), "2026-12-08T13:00:00.000Z");
  assert.equal(weekdayOf("2026-09-08"), 2, "mardi");
  assert.equal(weekdayOf("2026-09-13"), 0, "dimanche");
});

test("un apprenant ne se voit proposer que les créneaux de SES coachs", () => {
  const slots = [
    { host_id: "coach-a", calcom_ref: "self:coach-a:2026-09-08T12:00:00.000Z" },
    { host_id: "coach-b", calcom_ref: "self:coach-b:2026-09-08T12:00:00.000Z" },
    { host_id: "hote-calcom", calcom_ref: "cal:slot-42" },
    { host_id: "hote-calcom", calcom_ref: null },
  ];
  const visible = filterBookableSlots(slots, ["coach-a"]);
  assert.deepEqual(
    visible.map((s) => s.host_id),
    ["coach-a", "hote-calcom", "hote-calcom"],
    "le créneau auto-publié d'un autre coach est masqué ; le miroir Cal.com reste ouvert"
  );
});

test("sans coach référent, seuls les créneaux du miroir restent proposés", () => {
  const slots = [
    { host_id: "coach-a", calcom_ref: "self:coach-a:2026-09-08T12:00:00.000Z" },
    { host_id: "hote-calcom", calcom_ref: "cal:slot-42" },
  ];
  assert.deepEqual(filterBookableSlots(slots, []).map((s) => s.host_id), ["hote-calcom"]);
});

test("un créneau produit deux fois n'apparaît qu'une fois", () => {
  const slots = generateSlots({
    rules: [coachingTuesday, coachingTuesday],
    from: TUESDAY,
    to: TUESDAY,
    kind: "coaching",
    now: NOW,
  });
  assert.equal(slots.length, 3, "règles identiques → pas de doublon");
});
