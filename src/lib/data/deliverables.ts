import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ProjectDeliverable } from "@/lib/types";

/**
 * Deliverables data-access for the student portal.
 * RLS (`deliverables_student_manage`, migration 0004) scopes rows to the
 * authenticated student's own enrollment (org from the JWT `app_metadata.org_id`
 * claim); this layer never widens that scope.
 */

export async function getDeliverables(orgId: string): Promise<ProjectDeliverable[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("project_deliverables")
    .select("id, org_id, enrollment_id, project_number, deliverable_submitted, deliverable_url, submitted_at, source, validated_at, l360_score")
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
  const { data, error } = await supabase
    .from("project_deliverables")
    .update({
      deliverable_submitted: true,
      deliverable_url: deliverableUrl,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", deliverableId)
    .eq("org_id", orgId)
    // Un livrable géré par 360Learning ou déjà déposé ne se réécrit pas ici
    // (garde-fou serveur : trigger project_deliverables_protect_l360, 0023).
    .eq("deliverable_submitted", false)
    .eq("source", "platform")
    .select("id, org_id, enrollment_id, project_number, deliverable_submitted, deliverable_url, submitted_at, source, validated_at, l360_score")
    .single();
  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("Ce livrable est déjà déposé ou géré via 360Learning.");
    }
    throw new Error(`Failed to submit deliverable: ${error.message}`);
  }
  return data as ProjectDeliverable;
}
