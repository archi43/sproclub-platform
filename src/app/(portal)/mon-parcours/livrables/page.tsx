import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { getDeliverables } from "@/lib/data/deliverables";
import { DeliverableForm } from "./deliverable-form";

/**
 * Student portal — "Mes livrables" (écran de dépôt).
 * Submitting a deliverable opens the defense booking for that project (the gate
 * is enforced in the database, migration 0004).
 */
export default async function DeliverablesPage() {
  const org = await getOrgContext();
  if (!org) return <div><p>Organisme introuvable.</p></div>;

  const deliverables = await getDeliverables(org.id);

  return (
    <div className="space-y-5">
      <p style={{ marginBottom: 8 }}>
        <Link href="/mon-parcours">← Mon parcours</Link>
      </p>
      <h1>Mes livrables</h1>
      {deliverables.length === 0 ? (
        <p>Aucun projet à rendre pour le moment.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          {deliverables.map((d) => (
            <li key={d.id} style={{ border: "1px solid #e5e5e5", borderRadius: 8, padding: 16 }}>
              <strong>Projet {d.project_number}</strong>
              {d.deliverable_submitted ? (
                <p style={{ color: "#0a7d33", margin: "8px 0 0" }}>
                  ✓ Déposé{d.deliverable_url ? " — " : ""}
                  {d.deliverable_url && (
                    <a href={d.deliverable_url} target="_blank" rel="noreferrer">
                      voir le livrable
                    </a>
                  )}
                </p>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <DeliverableForm deliverableId={d.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
