"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { ok: boolean; message: string };

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
 * Send a passwordless magic link. The user completes sign-in by clicking the
 * e-mailed link, which returns to /auth/callback on the same tenant host.
 */
export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, message: "Veuillez saisir une adresse e-mail valide." };
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
    // Supabase's built-in email service is rate-limited; surface it plainly so
    // it isn't mistaken for a broken form. Configure a custom SMTP to remove it.
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return {
        ok: false,
        message: "Trop d'envois récents (limite du service e-mail). Patientez quelques minutes avant de réessayer.",
      };
    }
    return { ok: false, message: "Impossible d'envoyer le lien. Réessayez plus tard." };
  }
  return {
    ok: true,
    message: "Si un compte existe pour cette adresse, un lien de connexion vient d'être envoyé.",
  };
}
