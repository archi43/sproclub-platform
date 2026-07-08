import { getOrgContext } from "@/lib/tenant";
import { getEnrollmentsForOrg } from "@/lib/data/enrollments";

/**
 * Student portal — "Mon parcours" (pilot, écran P.A1).
 * The portal layout guarantees an authenticated `student` member of `org`.
 * Data isolation is enforced by RLS in the data-access layer.
 */
export default async function MonParcours() {
  const org = await getOrgContext();
  if (!org) {
    return (
      <main style={{ padding: 32 }}>
        <p>Organisme introuvable pour ce domaine.</p>
      </main>
    );
  }

  const enrollments = await getEnrollmentsForOrg(org.id);

  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>Mon parcours — {org.name}</h1>
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
