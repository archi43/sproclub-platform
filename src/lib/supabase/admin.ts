import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, serviceRoleKey } from "@/lib/env";

/**
 * Server-only admin client (service role). It BYPASSES Row Level Security, so it
 * must never be reached from client code and every caller must gate access with
 * a route/role guard first. Used where RLS cannot help by design — tenant
 * resolution and account provisioning (creating auth users) — not to widen data
 * reads that RLS already governs.
 */
export function adminClient(): SupabaseClient {
  return createClient(env.supabaseUrl, serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
