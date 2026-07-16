/**
 * Login rules (OTP par code) — pure, tested off-DB (same pattern as
 * ratelimit-rules / compliance-rules). The e-mail OTP is 6 digits
 * (supabase/config.toml, otp_length); users paste it with stray spaces or
 * separators, so normalize before verification.
 */

export const OTP_CODE_LENGTH = 6;

/** Normalize a user-typed OTP code: keep digits only. Returns the canonical
 *  6-digit string, or null when the input cannot be a valid code. */
export function sanitizeOtpCode(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length === OTP_CODE_LENGTH ? digits : null;
}
