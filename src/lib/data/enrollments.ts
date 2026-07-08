import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Enrollment } from "@/lib/types";

/**
 * Read the enrollments visible to the current user within one organization.
 *
 * Security is layered:
 *   1. RLS (`enrollments_read`) is the authoritative filter: org + role scoped.
 *      `current_org_id()` resolves from the user's JWT `app_metadata.org_id`
 *      claim — the mechanism that actually holds under PostgREST pooling.
 *   2. `.eq("org_id", orgId)` scopes the query (defense in depth + selects the
 *      active org for multi-org users).
 */
export async function getEnrollmentsForOrg(orgId: string): Promise<Enrollment[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("enrollments_ro")
    .select("id, org_id, program, specialty, status, start_date, end_date")
    .eq("org_id", orgId);

  if (error) throw new Error(`Failed to load enrollments: ${error.message}`);
  return (data ?? []) as Enrollment[];
}

/**
 * The current student's enrollment reference (ids needed to create bookings).
 * Returns null when the user has no visible enrollment in the org. RLS ensures
 * only the student's own row is returned.
 */
export async function getMyEnrollmentRef(
  orgId: string
): Promise<{ enrollmentId: string; learnerId: string } | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("enrollments_ro")
    .select("id, learner_id")
    .eq("org_id", orgId)
    .limit(1);
  if (error) throw new Error(`Failed to load enrollment: ${error.message}`);
  const row = data?.[0];
  return row ? { enrollmentId: row.id as string, learnerId: row.learner_id as string } : null;
}
