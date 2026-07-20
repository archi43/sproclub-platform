import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { getDeliverables } from "@/lib/data/deliverables";
import { getAvailabilities, getReservations } from "@/lib/data/reservations";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DefenseForm, type SlotOption } from "./defense-form";

const fmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

/** Student portal — defense booking. Eligible once the deliverable is submitted. */
export default async function SoutenancePage() {
  const org = await getOrgContext();
  if (!org) return <p className="text-muted">Organisme introuvable.</p>;

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
  const eligible = deliverables.filter((d) => d.deliverable_submitted && !activeDefenseProjects.has(d.project_number));
  const slotOptions: SlotOption[] = slots.map((s) => ({ id: s.id, label: fmt.format(new Date(s.starts_at)) }));
  const defenses = reservations.filter((r) => r.kind === "defense");

  return (
    <div className="space-y-8">
      <div>
        <PageHeader title="Réserver une soutenance" description="Un projet devient éligible une fois son livrable déposé." />
        {eligible.length === 0 ? (
          <EmptyState
            title="Aucun projet éligible"
            description="Déposez d'abord le livrable du projet."
            action={
              <Link href="/mon-parcours/livrables">
                <span className="text-sm font-medium text-brand">Aller à Mes livrables →</span>
              </Link>
            }
          />
        ) : slotOptions.length === 0 ? (
          <p className="text-sm text-muted">Aucun créneau de soutenance proposé pour le moment.</p>
        ) : (
          <ul className="space-y-4">
            {eligible.map((d) => (
              <li key={d.id}>
                <Card>
                  <p className="mb-2 font-heading font-semibold text-brand">Projet {d.project_number}</p>
                  <DefenseForm projectNumber={d.project_number} slots={slotOptions} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-brand">Mes soutenances</h2>
        {defenses.length === 0 ? (
          <p className="text-sm text-muted">Aucune soutenance réservée.</p>
        ) : (
          <ul className="space-y-2">
            {defenses.map((r) => (
              <li key={r.id} className="flex items-center gap-3 text-sm">
                <Badge tone="brand">Projet {r.project_number}</Badge>
                <span>{fmt.format(new Date(r.starts_at))}</span>
                <span className="text-muted">({r.status})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
