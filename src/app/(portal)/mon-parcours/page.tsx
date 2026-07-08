import { getOrgContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import type { Enrollment } from "@/lib/types";

/**
 * Student portal — "Mon parcours" (pilot, écran P.A1).
 * Security: RLS `is_member(org_id)` isolates data; we also scope the query to
 * the active organization. Setting the active org in the DB session
 * (current_org_id) is handled by the data-access layer — see README.
 */
export default async function MonParcours() {
  const org = await getOrgContext();
  if (!org) {
    return <main style={{ padding: 32 }}><p>Organisme introuvable pour ce domaine.</p></main>;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <main style={{ padding: 32 }}><p>Veuillez vous connecter pour accéder à votre espace.</p></main>;
  }

  const { data, error } = await supabase
    .from("enrollments_ro")
    .select("id, org_id, program, specialty, status, start_date, end_date")
    .eq("org_id", org.id);

  const enrollments = (data ?? []) as Enrollment[];

  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>Mon parcours — {org.name}</h1>
      {error && <p>Une erreur est survenue lors du chargement.</p>}
      {enrollments.length === 0 ? (
        <p>Aucun dossier de formation pour le moment.</p>
      ) : (
        <ul>
          {enrollments.map((e) => (
            <li key={e.id}>
              {e.program ?? "Programme"} — {e.status ?? "statut inconnu"}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
