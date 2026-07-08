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
  return resolveOrganization({ slug, customDomain });
}
