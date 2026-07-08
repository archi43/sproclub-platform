import "server-only";
import { createClient } from "@/lib/supabase/server";
import { setCurrentOrg } from "@/lib/data/org-context";
import type { ProjectDeliverable } from "@/lib/types";

/**
 * Deliverables data-access for the student portal.
 * RLS (`deliverables_student_manage`, migration 0004) scopes rows to the
 * authenticated student's own enrollment; this layer never widens that scope.
 */

export async function getDeliverables(orgId: string): Promise<ProjectDeliverable[]> {
  const supabase = createClient();
  await setCurrentOrg(supabase, orgId);
  const { data, error } = await supabase
    .from("project_deliverables")
    .select("id, org_id, enrollment_id, project_number, deliverable_submitted, deliverable_url, submitted_at")
    .eq("org_id", orgId)
    .order("project_number", { ascending: true });
  if (error) throw new Error(`Failed to load deliverables: ${error.message}`);
  return (data ?? []) as ProjectDeliverable[];
}

/**
 * Mark a deliverable as submitted. Filtering by id is enough: RLS guarantees a
 * student can only ever update a deliverable of their own enrollment. Returns
 * the updated row, or throws if nothing matched (e.g. not the student's row).
 */
export async function submitDeliverable(
  orgId: string,
  deliverableId: string,
  deliverableUrl: string
): Promise<ProjectDeliverable> {
  const supabase = createClient();
  await setCurrentOrg(supabase, orgId);
  const { data, error } = await supabase
    .from("project_deliverables")
    .update({
      deliverable_submitted: true,
      deliverable_url: deliverableUrl,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", deliverableId)
    .eq("org_id", orgId)
    .select("id, org_id, enrollment_id, project_number, deliverable_submitted, deliverable_url, submitted_at")
    .single();
  if (error) throw new Error(`Failed to submit deliverable: ${error.message}`);
  return data as ProjectDeliverable;
}
