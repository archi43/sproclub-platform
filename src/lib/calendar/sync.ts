import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseIcs, assertPublicHttpUrl } from "@/lib/calendar/ics";
import { publishMySlots, PUBLISH_HORIZON_DAYS } from "@/lib/data/availability";

/**
 * Synchronisation des agendas externes (INC-19) — job service-role.
 *
 * Pour chaque agenda relié : récupération du flux iCalendar, extraction des
 * occupations sur l'horizon, remplacement des `busy_periods` de la personne,
 * puis republication de ses créneaux (les occupations masquent les créneaux
 * correspondants).
 *
 * Dégradation propre : un flux injoignable n'interrompt pas les autres — son
 * erreur est consignée sur la ligne `calendar_feeds` et visible par le seul
 * titulaire. On ne supprime alors PAS ses occupations connues : mieux vaut
 * garder des créneaux masqués à tort qu'exposer un créneau déjà pris.
 */

export interface FeedSyncResult {
  profileId: string;
  ok: boolean;
  events: number;
  error?: string;
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000;

async function fetchIcs(url: string): Promise<string> {
  const safe = assertPublicHttpUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(safe.toString(), {
      signal: controller.signal,
      redirect: "error", // une redirection pourrait contourner la garde SSRF
      headers: { accept: "text/calendar, text/plain;q=0.8, */*;q=0.5" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error("Agenda trop volumineux");
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("Ce lien ne renvoie pas un agenda iCalendar");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** Message court, sans détail interne ni URL — il s'affiche à l'utilisateur. */
function shortError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "AbortError") return "Délai dépassé";
    return err.message.slice(0, 120);
  }
  return "Erreur inconnue";
}

export async function syncCalendars(
  admin: SupabaseClient,
  opts: { orgId: string; now?: Date; horizonDays?: number } = { orgId: "" }
): Promise<FeedSyncResult[]> {
  const now = opts.now ?? new Date();
  const horizon = opts.horizonDays ?? PUBLISH_HORIZON_DAYS;
  const from = now;
  const to = new Date(now.getTime() + horizon * 86_400_000);

  const { data: feeds, error } = await admin
    .from("calendar_feeds")
    .select("id, org_id, profile_id, ics_url, profile:profiles!inner(email)")
    .eq("org_id", opts.orgId)
    .eq("active", true);
  if (error) throw new Error(`Lecture des agendas impossible : ${error.message}`);

  const results: FeedSyncResult[] = [];

  for (const feed of feeds ?? []) {
    const profileId = feed.profile_id as string;
    const email = (feed.profile as unknown as { email: string } | null)?.email ?? "";
    try {
      const text = await fetchIcs(feed.ics_url as string);
      const events = parseIcs(text, { from, to });

      // Remplacement idempotent de la fenêtre : on ne touche qu'au futur.
      const del = await admin
        .from("busy_periods")
        .delete()
        .eq("org_id", opts.orgId)
        .eq("host_id", profileId)
        .eq("source", "ics")
        .gte("ends_at", from.toISOString());
      if (del.error) throw new Error(del.error.message);

      if (events.length > 0) {
        const ins = await admin.from("busy_periods").upsert(
          events.map((e) => ({
            org_id: opts.orgId,
            host_id: profileId,
            starts_at: e.startsAt,
            ends_at: e.endsAt,
            source: "ics",
            external_uid: e.uid,
            synced_at: now.toISOString(),
          })),
          { onConflict: "org_id,host_id,source,external_uid,starts_at", ignoreDuplicates: true }
        );
        if (ins.error) throw new Error(ins.error.message);
      }

      await admin
        .from("calendar_feeds")
        .update({
          last_synced_at: now.toISOString(),
          last_status: "ok",
          event_count: events.length,
        })
        .eq("id", feed.id as string);

      // Republier avec les occupations fraîches.
      await publishMySlots(opts.orgId, profileId, email, {
        client: admin,
        now,
        horizonDays: horizon,
      });

      results.push({ profileId, ok: true, events: events.length });
    } catch (err) {
      const message = shortError(err);
      await admin
        .from("calendar_feeds")
        .update({ last_synced_at: now.toISOString(), last_status: message })
        .eq("id", feed.id as string);
      results.push({ profileId, ok: false, events: 0, error: message });
    }
  }

  return results;
}
