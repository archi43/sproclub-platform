import { env } from "@/lib/env";

/**
 * Pure host → tenant locator logic. No server-only / Supabase imports so it can
 * run safely in the Edge middleware without pulling in the Node Supabase client.
 */
export type Locator = { slug?: string; customDomain?: string };

/** Derive a tenant locator from the request host. */
export function orgLocatorFromHost(host: string): Locator {
  const base = env.appBaseDomain.split(":")[0];
  const hostname = host.split(":")[0];
  if (hostname === base || hostname === `www.${base}`) return {}; // platform root
  if (hostname.endsWith(`.${base}`)) return { slug: hostname.slice(0, hostname.length - base.length - 1) };
  return { customDomain: hostname }; // organization custom domain
}
