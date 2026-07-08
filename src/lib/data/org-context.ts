import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Per-request organization context.
 *
 * RLS relies on `current_org_id()`, which resolves the active organization from
 * either a transaction-local GUC (`app.current_org_id`) or the user's JWT
 * `app_metadata.org_id` claim (see migration 0003). Under PostgREST connection
 * pooling the JWT claim is the reliable path, so single-org users are covered
 * automatically once their claim is set at provisioning time.
 *
 * `setCurrentOrg` calls the `set_current_org` RPC — useful for multi-org users
 * switching context and as an explicit, auditable signal of intent. It only
 * succeeds for organizations the caller belongs to (enforced in the RPC).
 */
export async function setCurrentOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<void> {
  const { error } = await supabase.rpc("set_current_org", { p_org: orgId });
  if (error) {
    // A membership violation here means the user tried to act outside their org.
    throw new Error(`Cannot set organization context: ${error.message}`);
  }
}
