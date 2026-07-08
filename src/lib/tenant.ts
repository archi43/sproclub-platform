import "server-only";
import { createClient as createAdminBase } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { env, serviceRoleKey } from "@/lib/env";
import type { Locator } from "@/lib/host";
import type { Organization } from "@/lib/types";

export { orgLocatorFromHost, type Locator } from "@/lib/host";

/** Server-only admin client (bypasses RLS) used ONLY for tenant resolution. */
function admin() {
  return createAdminBase(env.supabaseUrl, serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Look up an organization by slug or custom domain. */
export async function resolveOrganization(locator: Locator): Promise<Organization | null> {
  if (!locator.slug && !locator.customDomain) return null;
  const base = admin().from("organizations").select("id, slug, name, custom_domain, brand").limit(1);
  const { data } = locator.slug
    ? await base.eq("slug", locator.slug)
    : await base.eq("custom_domain", locator.customDomain as string);
  return (data?.[0] as Organization) ?? null;
}

/** Current organization, from headers set by middleware. */
export async function getOrgContext(): Promise<Organization | null> {
  const h = headers();
  const slug = h.get("x-org-slug") || undefined;
  const customDomain = h.get("x-org-domain") || undefined;
  const org = await resolveOrganization({ slug, customDomain });
  if (org) return org;

  // Default organization for the platform root (no sub-domain). Two opt-ins:
  //   - PLATFORM_DEFAULT_ORG_SLUG: intended for a single-tenant deployment
  //     (pilot/staging), honored in every environment. Leave it UNSET for a
  //     true multi-tenant deployment so the root stays the platform landing.
  //   - DEV_DEFAULT_ORG_SLUG: local-dev convenience only (never in production).
  if (!slug && !customDomain) {
    const platformSlug = process.env.PLATFORM_DEFAULT_ORG_SLUG;
    const devSlug = process.env.NODE_ENV !== "production" ? process.env.DEV_DEFAULT_ORG_SLUG : undefined;
    const fallback = platformSlug || devSlug;
    if (fallback) return resolveOrganization({ slug: fallback });
  }
  return null;
}
