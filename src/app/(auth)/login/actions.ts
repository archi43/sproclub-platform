"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/tenant";
import { checkRateLimit, checkRateLimitStrict, logOpsEvent } from "@/lib/data/ops";
import {
  LOGIN_LIMIT,
  LOGIN_EMAIL_LIMIT,
  OTP_VERIFY_LIMIT,
  OTP_VERIFY_EMAIL_LIMIT,
  clientIdentifier,
} from "@/lib/ratelimit-rules";
import { sanitizeOtpCode, isValidEmail, OTP_CODE_LENGTH } from "@/lib/login-rules";

/** `email` is echoed back on a successful code request so the verify step
 *  binds to the address the code was actually sent to. */
export type LoginState = { ok: boolean; message: string; email?: string };

/** Build the request origin from proxy-aware headers (multi-tenant hosts). */
function requestOrigin(): string {
  const h = headers();
  const explicit = h.get("origin");
  if (explicit) return explicit;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Send a passwordless 6-digit login code by e-mail. The user completes sign-in
 * by typing the code on this page (verifyLoginCode); the e-mail also carries a
 * magic-link fallback that returns to /auth/callback on the same tenant host.
 */
export async function requestLoginCode(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { ok: false, message: "Veuillez saisir une adresse e-mail valide." };
  }

  // Rate limit the public login entry point on two independent axes: per client
  // IP (broad spam from one source) and per recipient e-mail (targeted mailbomb
  // that rotates IPs). Blocked if either budget is exhausted.
  const h = headers();
  const key = clientIdentifier(h.get("x-real-ip"), h.get("x-forwarded-for"));
  const org = await getOrgContext();
  const [allowedByIp, allowedByEmail] = await Promise.all([
    checkRateLimit(LOGIN_LIMIT, key),
    checkRateLimit(LOGIN_EMAIL_LIMIT, email),
  ]);
  if (!allowedByIp || !allowedByEmail) {
    if (org) {
      await logOpsEvent({
        orgId: org.id,
        level: "warn",
        source: "login",
        message: "Débit de connexion dépassé",
        detail: allowedByEmail ? `client=${key}` : "cible=e-mail",
      });
    }
    return {
      ok: false,
      message: "Trop de tentatives de connexion. Patientez quelques minutes avant de réessayer.",
    };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${requestOrigin()}/auth/callback`,
      // Do not auto-create accounts from the login form: users are provisioned
      // by an organization admin (memberships drive access). Prevents strangers
      // from creating orphan accounts.
      shouldCreateUser: false,
    },
  });

  if (error) {
    // Unknown account (shouldCreateUser: false → "otp_disabled"/"signups not
    // allowed"): answer EXACTLY like the success case, otherwise the response
    // difference lets an attacker enumerate which addresses have an account.
    if (error.code === "otp_disabled" || /signups? not allowed/i.test(error.message)) {
      return {
        ok: true,
        message: "Si un compte existe pour cette adresse, un code de connexion vient d'être envoyé.",
        email,
      };
    }
    // Supabase's built-in email service is rate-limited; surface it plainly so
    // it isn't mistaken for a broken form. Configure a custom SMTP to remove it.
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return {
        ok: false,
        message: "Trop d'envois récents (limite du service e-mail). Patientez quelques minutes avant de réessayer.",
      };
    }
    if (org) {
      await logOpsEvent({
        orgId: org.id,
        level: "error",
        source: "login",
        message: "Échec d'envoi du lien de connexion",
        detail: error.message,
      });
    }
    return { ok: false, message: "Impossible d'envoyer le code. Réessayez plus tard." };
  }
  return {
    ok: true,
    message: "Si un compte existe pour cette adresse, un code de connexion vient d'être envoyé.",
    email,
  };
}

/**
 * Verify the 6-digit code typed by the user and open the session. Attempts are
 * rate-limited on two independent axes (client IP and target e-mail) because a
 * 6-digit code is brute-forceable without a per-target budget.
 */
export async function verifyLoginCode(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = sanitizeOtpCode(String(formData.get("code") ?? ""));
  if (!isValidEmail(email)) {
    return { ok: false, message: "Session de connexion invalide. Redemandez un code." };
  }
  if (!code) {
    return { ok: false, message: `Le code comporte ${OTP_CODE_LENGTH} chiffres.` };
  }

  // Fail-CLOSED here: this limiter is the only per-target guard against brute
  // force of a 6-digit code, so a limiter outage must refuse attempts.
  const h = headers();
  const key = clientIdentifier(h.get("x-real-ip"), h.get("x-forwarded-for"));
  const [allowedByIp, allowedByEmail] = await Promise.all([
    checkRateLimitStrict(OTP_VERIFY_LIMIT, key),
    checkRateLimitStrict(OTP_VERIFY_EMAIL_LIMIT, email),
  ]);
  if (!allowedByIp || !allowedByEmail) {
    const org = await getOrgContext();
    if (org) {
      await logOpsEvent({
        orgId: org.id,
        level: "warn",
        source: "login",
        message: "Débit de vérification de code dépassé",
        detail: allowedByEmail ? `client=${key}` : "cible=e-mail",
      });
    }
    return {
      ok: false,
      message: "Trop de tentatives. Patientez quelques minutes puis redemandez un code.",
    };
  }

  // Supabase binds the code to the address it was sent to: a code issued for A
  // never authenticates B, so a tampered hidden `email` field only attacks its
  // own per-target budget above.
  const supabase = createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) {
    // Trace sub-threshold failures for anomaly detection (never the code nor
    // the address — the client identifier is enough to correlate a campaign).
    const org = await getOrgContext();
    if (org) {
      await logOpsEvent({
        orgId: org.id,
        level: "warn",
        source: "login",
        message: "Échec de vérification de code",
        detail: `client=${key}`,
      });
    }
    // Keep the reason generic: never confirm whether the account exists.
    return { ok: false, message: "Code invalide ou expiré. Vérifiez-le ou redemandez un code." };
  }

  redirect("/mon-parcours");
}
