import "server-only";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import type { RateLimit } from "@/lib/ratelimit-rules";

/**
 * Exploitation & observabilité (INC-12).
 *
 * - Operational events are WRITTEN server-side with the service role (route
 *   handlers, the login action, crons) and READ by staff through RLS.
 * - Rate limiting delegates the sliding-window counting to the DB function
 *   `rate_limit_touch` (0020), called with the service role.
 *
 * Everything here is best-effort on the write path: observability must never take
 * down the request it is observing.
 */

export type OpsLevel = "info" | "warn" | "error";

export interface OpsEventInput {
  orgId: string;
  level: OpsLevel;
  source: string;
  message: string;
  detail?: string | null;
}

export interface OpsEvent {
  id: number;
  level: OpsLevel;
  source: string;
  message: string;
  detail: string | null;
  at: string;
}

/** Record an operational event (service-role write). Best-effort: a logging
 *  failure never propagates. `error`-level events are also emitted to the server
 *  console and, if `OPS_ALERT_WEBHOOK` is configured, pushed to that webhook. */
export async function logOpsEvent(input: OpsEventInput): Promise<void> {
  try {
    const admin = adminClient();
    await admin.from("ops_events").insert({
      org_id: input.orgId,
      level: input.level,
      source: input.source,
      message: input.message,
      detail: input.detail ?? null,
    });
    if (input.level === "error") {
      console.error(`[ops:${input.source}] ${input.message}${input.detail ? ` — ${input.detail}` : ""}`);
      await sendAlert(input);
    }
  } catch {
    // Never let observability break the observed request.
  }
}

/** Optional external alerting — only when an env webhook is configured; no secret
 *  is stored in the repository. Best-effort and time-bounded. */
async function sendAlert(input: OpsEventInput): Promise<void> {
  const url = process.env.OPS_ALERT_WEBHOOK;
  if (!url) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `🔴 SproCLUB [${input.source}] ${input.message}`,
        level: input.level,
        source: input.source,
        detail: input.detail ?? undefined,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  } catch {
    // Alerting is best-effort.
  }
}

/** Recent operational events for the current org (staff read via RLS). */
export async function recentOpsEvents(
  orgId: string,
  opts: { level?: OpsLevel; limit?: number } = {}
): Promise<OpsEvent[]> {
  const supabase = createClient();
  let query = supabase
    .from("ops_events")
    .select("id, level, source, message, detail, at")
    .eq("org_id", orgId)
    .order("at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.level) query = query.eq("level", opts.level);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load operational events: ${error.message}`);
  return (data ?? []) as OpsEvent[];
}

export interface OpsSummary {
  errors24h: number;
  warns24h: number;
  errors7d: number;
  total7d: number;
}

/** Headline counts for the observability dashboard (staff read via RLS). */
export async function opsSummary(orgId: string): Promise<OpsSummary> {
  const supabase = createClient();
  const now = Date.now();
  const since24h = new Date(now - 24 * 3600_000).toISOString();
  const since7d = new Date(now - 7 * 86_400_000).toISOString();
  const count = async (filter: (q: ReturnType<typeof baseQuery>) => ReturnType<typeof baseQuery>) => {
    const { count: c } = await filter(baseQuery());
    return c ?? 0;
  };
  function baseQuery() {
    return supabase.from("ops_events").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  }
  const [errors24h, warns24h, errors7d, total7d] = await Promise.all([
    count((q) => q.eq("level", "error").gte("at", since24h)),
    count((q) => q.eq("level", "warn").gte("at", since24h)),
    count((q) => q.eq("level", "error").gte("at", since7d)),
    count((q) => q.gte("at", since7d)),
  ]);
  return { errors24h, warns24h, errors7d, total7d };
}

async function touchRateLimit(limit: RateLimit, key: string): Promise<boolean> {
  const admin = adminClient();
  const { data, error } = await admin.rpc("rate_limit_touch", {
    p_bucket: limit.bucket,
    p_key: key,
    p_window_seconds: limit.windowSeconds,
    p_max: limit.max,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

/**
 * Check (and record) a rate-limit hit for a (bucket, key). Returns true when the
 * request is still within budget, false when the limit is exceeded. Fails SAFE:
 * if the limiter itself errors we allow the request (availability over a hard
 * block) but log the incident so it is visible.
 */
export async function checkRateLimit(limit: RateLimit, key: string): Promise<boolean> {
  try {
    return await touchRateLimit(limit, key);
  } catch (err) {
    console.error(`[ops:ratelimit] limiter unavailable for '${limit.bucket}': ${err instanceof Error ? err.message : err}`);
    return true; // fail-open: never lock legitimate users out on limiter failure
  }
}

/**
 * Fail-CLOSED variant for authentication-critical paths (OTP code verification):
 * the 6-digit code is brute-forceable and this limiter is its only per-target
 * guard, so when the limiter itself is down we refuse the attempt rather than
 * run unprotected. Genuine users retry once the incident is over.
 */
export async function checkRateLimitStrict(limit: RateLimit, key: string): Promise<boolean> {
  try {
    return await touchRateLimit(limit, key);
  } catch (err) {
    console.error(
      `[ops:ratelimit] limiter unavailable for '${limit.bucket}', refusing attempt (fail-closed): ${err instanceof Error ? err.message : err}`
    );
    return false;
  }
}
