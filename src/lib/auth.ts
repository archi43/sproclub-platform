import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/types";

/**
 * Authentication & authorization helpers (server-only).
 *
 * Roles are per-organization and live in `memberships` (see 0002/0003). These
 * helpers are the single gate used by route guards; RLS remains the real
 * server-side safety net — guards are for UX/redirects, not the last line of
 * defense.
 */

/** The authenticated Supabase user, or null. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

/** Redirect to the login page unless a user is authenticated. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** The current user's roles within a given organization. */
export async function getRolesForOrg(orgId: string): Promise<AppRole[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", orgId);
  return (data ?? []).map((row) => row.role as AppRole);
}

/**
 * Route guard: require the user to hold at least one of `allowed` roles in the
 * organization. Redirects unauthenticated users to /login and unauthorized
 * members to /forbidden.
 */
export async function requireOrgRole(orgId: string, allowed: AppRole[]): Promise<AppRole[]> {
  await requireUser();
  const roles = await getRolesForOrg(orgId);
  const granted = roles.filter((r) => allowed.includes(r));
  if (granted.length === 0) redirect("/forbidden");
  return granted;
}
