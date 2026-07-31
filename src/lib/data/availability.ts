import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  generateSlots,
  type AvailabilityRule,
  type AvailabilityBlock,
  type BookingKind,
  type BusyPeriod,
} from "@/lib/availability-rules";

/**
 * Disponibilités déclarées par les coachs et le jury (INC-19), RLS-enforced.
 *
 * Chaque titulaire ne voit et n'écrit que SES lignes (policies `_own_manage`,
 * `0027`) : la couche ne filtre pas par `host_id` pour se protéger, elle le
 * renseigne pour que l'insertion soit acceptée. La coordination, elle, dispose
 * de policies staff distinctes.
 *
 * La publication traduit les déclarations en créneaux concrets dans
 * `availabilities`, préfixés `self:` — le miroir Cal.com ne purge que `cal:%`,
 * les deux sources coexistent.
 */

export interface RuleRow extends AvailabilityRule {
  id: string;
}

export interface BlockRow extends AvailabilityBlock {
  id: string;
  reason: string | null;
}

export interface FeedRow {
  id: string;
  icsUrl: string;
  active: boolean;
  lastSyncedAt: string | null;
  lastStatus: string | null;
  eventCount: number | null;
}

type Client = SupabaseClient;
const db = (client?: Client): Client => client ?? (createClient() as unknown as Client);

/** Horizon de publication : au-delà, les créneaux n'ont pas de sens pratique. */
export const PUBLISH_HORIZON_DAYS = 60;

// -----------------------------------------------------------------------------
// Plages récurrentes
// -----------------------------------------------------------------------------

export async function listMyRules(orgId: string, hostId: string, client?: Client): Promise<RuleRow[]> {
  const { data, error } = await db(client)
    .from("availability_rules")
    .select("id, kind, weekday, start_time, end_time, slot_minutes, valid_from, valid_to, active")
    .eq("org_id", orgId)
    .eq("host_id", hostId)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw new Error(`Lecture des plages impossible : ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as BookingKind,
    weekday: r.weekday as number,
    startTime: (r.start_time as string).slice(0, 5),
    endTime: (r.end_time as string).slice(0, 5),
    slotMinutes: r.slot_minutes as number,
    validFrom: r.valid_from as string | null,
    validTo: r.valid_to as string | null,
    active: r.active as boolean,
  }));
}

export async function addRule(
  orgId: string,
  hostId: string,
  input: Omit<AvailabilityRule, "active">,
  client?: Client
): Promise<void> {
  if (input.endTime <= input.startTime) {
    throw new Error("L'heure de fin doit suivre l'heure de début.");
  }
  const { error } = await db(client).from("availability_rules").insert({
    org_id: orgId,
    host_id: hostId,
    kind: input.kind,
    weekday: input.weekday,
    start_time: input.startTime,
    end_time: input.endTime,
    slot_minutes: input.slotMinutes,
    valid_from: input.validFrom ?? null,
    valid_to: input.validTo ?? null,
  });
  if (error) throw new Error(`Ajout de la plage impossible : ${error.message}`);
}

export async function deleteRule(orgId: string, id: string, client?: Client): Promise<void> {
  const { error } = await db(client).from("availability_rules").delete().eq("org_id", orgId).eq("id", id);
  if (error) throw new Error(`Suppression impossible : ${error.message}`);
}

export async function setRuleActive(orgId: string, id: string, active: boolean, client?: Client): Promise<void> {
  const { error } = await db(client)
    .from("availability_rules")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw new Error(`Mise à jour impossible : ${error.message}`);
}

// -----------------------------------------------------------------------------
// Exceptions ponctuelles
// -----------------------------------------------------------------------------

export async function listMyBlocks(orgId: string, hostId: string, client?: Client): Promise<BlockRow[]> {
  const { error, data } = await db(client)
    .from("availability_blocks")
    .select("id, kind, effect, starts_at, ends_at, slot_minutes, reason")
    .eq("org_id", orgId)
    .eq("host_id", hostId)
    .gte("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true });
  if (error) throw new Error(`Lecture des exceptions impossible : ${error.message}`);
  return (data ?? []).map((b) => ({
    id: b.id as string,
    kind: (b.kind as BookingKind | null) ?? null,
    effect: b.effect as "open" | "closed",
    startsAt: b.starts_at as string,
    endsAt: b.ends_at as string,
    slotMinutes: b.slot_minutes as number,
    reason: (b.reason as string | null) ?? null,
  }));
}

export async function addBlock(
  orgId: string,
  hostId: string,
  input: AvailabilityBlock & { reason?: string | null },
  client?: Client
): Promise<void> {
  if (input.endsAt <= input.startsAt) {
    throw new Error("La fin doit suivre le début.");
  }
  const { error } = await db(client).from("availability_blocks").insert({
    org_id: orgId,
    host_id: hostId,
    kind: input.kind,
    effect: input.effect,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    slot_minutes: input.slotMinutes ?? 60,
    reason: input.reason ?? null,
  });
  if (error) throw new Error(`Ajout de l'exception impossible : ${error.message}`);
}

export async function deleteBlock(orgId: string, id: string, client?: Client): Promise<void> {
  const { error } = await db(client).from("availability_blocks").delete().eq("org_id", orgId).eq("id", id);
  if (error) throw new Error(`Suppression impossible : ${error.message}`);
}

// -----------------------------------------------------------------------------
// Agenda externe (iCalendar)
// -----------------------------------------------------------------------------

export async function getMyFeed(orgId: string, profileId: string, client?: Client): Promise<FeedRow | null> {
  const { data, error } = await db(client)
    .from("calendar_feeds")
    .select("id, ics_url, active, last_synced_at, last_status, event_count")
    .eq("org_id", orgId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw new Error(`Lecture de l'agenda impossible : ${error.message}`);
  if (!data) return null;
  return {
    id: data.id as string,
    icsUrl: data.ics_url as string,
    active: data.active as boolean,
    lastSyncedAt: data.last_synced_at as string | null,
    lastStatus: data.last_status as string | null,
    eventCount: data.event_count as number | null,
  };
}

export async function saveFeed(orgId: string, profileId: string, icsUrl: string, client?: Client): Promise<void> {
  const url = icsUrl.trim();
  // Validation à la frontière : seul un lien HTTP(S) est accepté (pas de
  // `file://`, pas de schéma exotique qui ferait diverger le job de sync).
  let parsed: URL;
  try {
    parsed = new URL(url.replace(/^webcal:\/\//i, "https://"));
  } catch {
    throw new Error("Lien d'agenda invalide.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Le lien doit commencer par https://");
  }
  const { error } = await db(client)
    .from("calendar_feeds")
    .upsert(
      { org_id: orgId, profile_id: profileId, ics_url: parsed.toString(), active: true, last_status: null },
      { onConflict: "org_id,profile_id" }
    );
  if (error) throw new Error(`Enregistrement de l'agenda impossible : ${error.message}`);
}

export async function deleteFeed(orgId: string, profileId: string, client?: Client): Promise<void> {
  const supabase = db(client);
  const { error } = await supabase.from("calendar_feeds").delete().eq("org_id", orgId).eq("profile_id", profileId);
  if (error) throw new Error(`Suppression impossible : ${error.message}`);
}

// -----------------------------------------------------------------------------
// Occupations : agenda externe + rendez-vous déjà pris par le titulaire
// -----------------------------------------------------------------------------

export async function listMyBusy(
  orgId: string,
  hostId: string,
  from: string,
  to: string,
  client?: Client
): Promise<BusyPeriod[]> {
  const { data, error } = await db(client)
    .from("busy_periods")
    .select("starts_at, ends_at")
    .eq("org_id", orgId)
    .eq("host_id", hostId)
    .gte("ends_at", from)
    .lte("starts_at", to);
  if (error) throw new Error(`Lecture des occupations impossible : ${error.message}`);
  return (data ?? []).map((b) => ({ startsAt: b.starts_at as string, endsAt: b.ends_at as string }));
}

/**
 * Rendez-vous déjà pris par le titulaire : coaching de SES dossiers (le lien
 * passe par `enrollments_ro.coach_email`) et soutenances où il siège au jury
 * (`reservation_evaluators`). Sans cela, republier écraserait un créneau déjà
 * réservé et laisserait deux personnes le choisir.
 */
export async function listMyBookedPeriods(
  orgId: string,
  hostId: string,
  email: string,
  from: string,
  to: string,
  client?: Client
): Promise<BusyPeriod[]> {
  const supabase = db(client);
  const periods: BusyPeriod[] = [];

  const coaching = await supabase
    .from("reservations")
    .select("starts_at, ends_at, enrollment:enrollments_ro!inner(coach_email)")
    .eq("org_id", orgId)
    .neq("status", "cancelled")
    .gte("ends_at", from)
    .lte("starts_at", to)
    .eq("enrollment.coach_email", email.trim().toLowerCase());
  if (coaching.error) throw new Error(`Lecture des rendez-vous impossible : ${coaching.error.message}`);
  periods.push(
    ...(coaching.data ?? []).map((r) => ({ startsAt: r.starts_at as string, endsAt: r.ends_at as string }))
  );

  const jury = await supabase
    .from("reservation_evaluators")
    .select("reservation:reservations!inner(starts_at, ends_at, status, org_id)")
    .eq("org_id", orgId)
    .eq("evaluator_id", hostId);
  if (jury.error) throw new Error(`Lecture du jury impossible : ${jury.error.message}`);
  for (const row of jury.data ?? []) {
    const r = row.reservation as unknown as { starts_at: string; ends_at: string; status: string } | null;
    if (!r || r.status === "cancelled") continue;
    if (r.ends_at < from || r.starts_at > to) continue;
    periods.push({ startsAt: r.starts_at, endsAt: r.ends_at });
  }

  return periods;
}

/**
 * Profils des coachs référents de l'appelant (apprenant). La RLS borne
 * `enrollments_ro` à ses propres dossiers ; on traduit `coach_email` en
 * identifiant de profil pour ne lui proposer que les créneaux de SES coachs.
 */
export async function getMyCoachHostIds(orgId: string, client?: Client): Promise<string[]> {
  const supabase = db(client);
  const { data: enrollments, error } = await supabase
    .from("enrollments_ro")
    .select("coach_email")
    .eq("org_id", orgId);
  if (error) throw new Error(`Lecture des dossiers impossible : ${error.message}`);

  const emails = [
    ...new Set(
      (enrollments ?? [])
        .map((e) => (e.coach_email as string | null)?.trim().toLowerCase())
        .filter((e): e is string => !!e)
    ),
  ];
  if (emails.length === 0) return [];

  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id")
    .in("email", emails);
  if (profErr) throw new Error(`Lecture des coachs impossible : ${profErr.message}`);
  return (profiles ?? []).map((p) => p.id as string);
}

// -----------------------------------------------------------------------------
// Publication : déclarations → créneaux réservables
// -----------------------------------------------------------------------------

export interface PublishResult {
  kind: BookingKind;
  count: number;
}

/**
 * Recalcule les créneaux `self:` du titulaire sur l'horizon, pour les deux
 * types de rendez-vous. Remplacement idempotent : on supprime les futurs
 * créneaux `self:` de cet hôte puis on réinsère l'état courant.
 */
export async function publishMySlots(
  orgId: string,
  hostId: string,
  email: string,
  opts: { client?: Client; now?: Date; horizonDays?: number } = {}
): Promise<PublishResult[]> {
  const supabase = db(opts.client);
  const now = opts.now ?? new Date();
  const horizon = opts.horizonDays ?? PUBLISH_HORIZON_DAYS;
  const from = now.toISOString().slice(0, 10);
  const toDate = new Date(now.getTime() + horizon * 86_400_000);
  const to = toDate.toISOString().slice(0, 10);

  const [rules, blocks, busy, booked] = await Promise.all([
    listMyRules(orgId, hostId, supabase),
    listMyBlocks(orgId, hostId, supabase),
    listMyBusy(orgId, hostId, now.toISOString(), toDate.toISOString(), supabase),
    listMyBookedPeriods(orgId, hostId, email, now.toISOString(), toDate.toISOString(), supabase),
  ]);

  const del = await supabase
    .from("availabilities")
    .delete()
    .eq("org_id", orgId)
    .eq("host_id", hostId)
    .gte("starts_at", now.toISOString())
    .like("calcom_ref", "self:%");
  if (del.error) throw new Error(`Nettoyage des créneaux impossible : ${del.error.message}`);

  const results: PublishResult[] = [];
  for (const kind of ["coaching", "defense"] as BookingKind[]) {
    const slots = generateSlots({
      rules,
      blocks,
      busy: [...busy, ...booked],
      from,
      to,
      kind,
      now,
    });
    if (slots.length > 0) {
      const ins = await supabase.from("availabilities").insert(
        slots.map((s) => ({
          org_id: orgId,
          host_id: hostId,
          kind,
          starts_at: s.startsAt,
          ends_at: s.endsAt,
          calcom_ref: `self:${hostId}:${s.startsAt}`,
        }))
      );
      if (ins.error) throw new Error(`Publication impossible : ${ins.error.message}`);
    }
    results.push({ kind, count: slots.length });
  }
  return results;
}
