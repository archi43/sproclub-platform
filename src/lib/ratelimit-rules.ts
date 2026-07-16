/**
 * Rate-limiting rules — pure, tested off-DB (same pattern as compliance-rules /
 * reporting-rules / rgpd-rules). The sliding-window counting itself lives in the
 * DB (rate_limit_touch, 0020); here we keep the pure pieces: how to derive the
 * client identifier from proxy headers, and the named limit configuration.
 */

/** Named limit: at most `max` attempts per `windowSeconds` for a (bucket, key). */
export interface RateLimit {
  bucket: string;
  windowSeconds: number;
  max: number;
}

/** Login, per client IP: 5 magic-link requests per 15 min — enough for a
 *  fat-fingered user, tight enough to blunt broad spam from one source. */
export const LOGIN_LIMIT: RateLimit = { bucket: "login", windowSeconds: 15 * 60, max: 5 };

/** Login, per RECIPIENT e-mail: 5 per 15 min. Independent of the client IP, so a
 *  distributed attacker cannot mailbomb one address by rotating source IPs — the
 *  IP-based bucket alone would not stop that. Defense in depth. */
export const LOGIN_EMAIL_LIMIT: RateLimit = { bucket: "login-email", windowSeconds: 15 * 60, max: 5 };

/** OTP verification, per client IP: 10 code entries per 15 min — a genuine user
 *  mistypes once or twice; anything more from one source is probing. */
export const OTP_VERIFY_LIMIT: RateLimit = { bucket: "otp-verify", windowSeconds: 15 * 60, max: 10 };

/** OTP verification, per TARGET e-mail: 5 per 15 min. The code has 10^6
 *  combinations; capping attempts per target keeps brute force infeasible even
 *  when the attacker rotates source IPs. Separate budget from sending. */
export const OTP_VERIFY_EMAIL_LIMIT: RateLimit = { bucket: "otp-verify-email", windowSeconds: 15 * 60, max: 5 };

/**
 * Derive a stable client identifier from proxy-aware headers. On Vercel the real
 * client IP is exposed via `x-real-ip` (set by the platform, not the caller), so
 * we prefer it over `x-forwarded-for` (whose leftmost entry can be spoofed by the
 * caller). Falls back to the first XFF hop, then to "unknown" (so the limiter
 * degrades to a single shared bucket rather than throwing — fail-safe).
 */
export function clientIdentifier(xRealIp: string | null, xForwardedFor: string | null = null): string {
  const real = (xRealIp ?? "").trim();
  if (real) return real;
  const first = (xForwardedFor ?? "").split(",")[0]?.trim();
  if (first) return first;
  return "unknown";
}
