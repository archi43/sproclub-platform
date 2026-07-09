import { getOrgContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { getAvailabilities, getReservations } from "@/lib/data/reservations";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookButton } from "./book-button";

const fmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

/** Student portal — coaching booking (pilot). */
export default async function ReservationPage() {
  const org = await getOrgContext();
  if (!org) return <p className="text-grey-600">Organisme introuvable.</p>;

  const supabase = createClient();
  const [slots, reservations] = await Promise.all([
    getAvailabilities(supabase, org.id, "coaching"),
    getReservations(supabase, org.id),
  ]);
  const booked = new Set(reservations.map((r) => r.starts_at));

  return (
    <div className="space-y-8">
      <div>
        <PageHeader title="Réserver un coaching" description="Choisissez un créneau parmi les disponibilités." />
        {slots.length === 0 ? (
          <EmptyState title="Aucun créneau proposé" description="Les créneaux de coaching apparaîtront ici." />
        ) : (
          <ul className="space-y-2">
            {slots.map((s) => (
              <li key={s.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="text-sm">{fmt.format(new Date(s.starts_at))}</span>
                  {booked.has(s.starts_at) ? <Badge tone="success">Réservé</Badge> : <BookButton availabilityId={s.id} />}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-brand">Mes réservations</h2>
        {reservations.length === 0 ? (
          <p className="text-sm text-grey-600">Aucune réservation pour le moment.</p>
        ) : (
          <ul className="space-y-2">
            {reservations.map((r) => (
              <li key={r.id} className="flex items-center gap-3 text-sm">
                <Badge tone="brand">{r.kind === "coaching" ? "Coaching" : "Soutenance"}</Badge>
                <span>{fmt.format(new Date(r.starts_at))}</span>
                <span className="text-grey-600">({r.status})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
