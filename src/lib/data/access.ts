import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Journal des accès rapprochés depuis Airtable (INC-29), lu **sous RLS**.
 *
 * La policy `access_sync_log_staff_read` (0031) borne la lecture à la direction
 * et à la coordination de l'organisme actif : le journal nomme des personnes, il
 * n'a rien à faire devant un apprenant, un coach ou une entreprise partenaire.
 * Aucune policy d'écriture n'existe, seul le service-role insère.
 *
 * Client injecté par requête, jamais global : c'est ce qui permet aux tests de
 * prouver l'isolation plutôt que de la supposer.
 */

export interface AccessDecision {
  action: "create" | "grant" | "reactivate" | "deactivate" | "skip";
  email: string;
  role: string;
  reason: string | null;
  at: string;
}

/** Dernières décisions, les plus récentes d'abord. */
export async function listAccessDecisions(orgId: string, limit = 20): Promise<AccessDecision[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("access_sync_log")
    .select("action, email, role, reason, at")
    .eq("org_id", orgId)
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load access decisions: ${error.message}`);
  return (data ?? []) as AccessDecision[];
}
