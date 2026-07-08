import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { getDeliverables } from "@/lib/data/deliverables";
import { getAvailabilities, getReservations } from "@/lib/data/reservations";
import { DefenseForm, type SlotOption } from "./defense-form";

const fmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

/**
 * Student portal — defense (soutenance) booking.
 * A project becomes eligible once its deliverable is submitted; the database
 * also guarantees at most one active defense per project (migration 0004).
 */
export default async function SoutenancePage() {
  const org = await getOrgContext();
  if (!org) return <main style={{ padding: 32 }}><p>Organisme introuvable.</p></main>;

  const supabase = createClient();
  const [deliverables, reservations, slots] = await Promise.all([
    getDeliverables(org.id),
    getReservations(supabase, org.id),
    getAvailabilities(supabase, org.id, "defense"),
  ]);

  const activeDefenseProjects = new Set(
    reservations
      .filter((r) => r.kind === "defense" && (r.status === "pending" || r.status === "confirmed"))
      .map((r) => r.project_number)
  );
  const eligible = deliverables.filter(
    (d) => d.deliverable_submitted && !activeDefenseProjects.has(d.project_number)
  );
  const slotOptions: SlotOption[] = slots.map((s) => ({ id: s.id, label: fmt.format(new Date(s.starts_at)) }));
  const defenses = reservations.filter((r) => r.kind === "defense");

  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <p style={{ marginBottom: 8 }}>
        <Link href="/mon-parcours">← Mon parcours</Link>
      </p>
      <h1>Réserver une soutenance</h1>

      {eligible.length === 0 ? (
        <p>
          Aucun projet éligible pour le moment. Déposez d'abord le livrable du projet depuis{" "}
          <Link href="/mon-parcours/livrables">Mes livrables</Link>.
        </p>
      ) : slotOptions.length === 0 ? (
        <p>Aucun créneau de soutenance proposé pour le moment.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          {eligible.map((d) => (
            <li key={d.id} style={{ border: "1px solid #e5e5e5", borderRadius: 8, padding: 16 }}>
              <strong>Projet {d.project_number}</strong>
              <div style={{ marginTop: 8 }}>
                <DefenseForm projectNumber={d.project_number} slots={slotOptions} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Mes soutenances</h2>
      {defenses.length === 0 ? (
        <p>Aucune soutenance réservée.</p>
      ) : (
        <ul>
          {defenses.map((r) => (
            <li key={r.id}>
              Projet {r.project_number} — {fmt.format(new Date(r.starts_at))} ({r.status})
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
