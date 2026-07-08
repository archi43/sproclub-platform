import "server-only";
import { createClient } from "@/lib/supabase/server";
import { setCurrentOrg } from "@/lib/data/org-context";
import type { Enrollment } from "@/lib/types";

/**
 * Read the enrollments visible to the current user within one organization.
 *
 * Security is layered:
 *   1. `setCurrentOrg` sets the request organization context.
 *   2. `.eq("org_id", orgId)` scopes the query (defense in depth + selects the
 *      active org for multi-org users).
 *   3. RLS (`enrollments_read`) is the authoritative filter: org + role scoped.
 */
export async function getEnrollmentsForOrg(orgId: string): Promise<Enrollment[]> {
  const supabase = createClient();
  await setCurrentOrg(supabase, orgId);

  const { data, error } = await supabase
    .from("enrollments_ro")
    .select("id, org_id, program, specialty, status, start_date, end_date")
    .eq("org_id", orgId);

  if (error) throw new Error(`Failed to load enrollments: ${error.message}`);
  return (data ?? []) as Enrollment[];
}
