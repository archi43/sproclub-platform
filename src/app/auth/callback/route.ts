import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link landing route. Supports both sign-in flows:
 *   - PKCE (`?code=…`): the standard @supabase/ssr e-mail link.
 *   - OTP verify (`?token_hash=…&type=…`): admin-generated links and the
 *     token-hash flow.
 * On success, sets the session cookie and redirects to the requested
 * destination (default: student portal).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/mon-parcours";

  const supabase = createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // Invalid or expired link.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
