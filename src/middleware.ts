import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { env } from "@/lib/env";
import { orgLocatorFromHost } from "@/lib/host";

/**
 * Middleware responsibilities:
 *  1. Resolve the tenant (organization) from the request host and expose it to
 *     downstream Server Components via request headers.
 *  2. Refresh the Supabase auth session (standard @supabase/ssr pattern).
 */
export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const locator = orgLocatorFromHost(request.headers.get("host") ?? "");
  requestHeaders.set("x-org-slug", locator.slug ?? "");
  requestHeaders.set("x-org-domain", locator.customDomain ?? "");

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
