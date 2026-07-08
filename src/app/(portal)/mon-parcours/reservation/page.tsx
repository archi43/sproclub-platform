import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { getAvailabilities, getReservations } from "@/lib/data/reservations";
import { BookButton } from "./book-button";

const fmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

/** Student portal — coaching booking (pilot). Defense booking opens once the
 *  matching deliverable is submitted (see /mon-parcours/livrables). */
export default async function ReservationPage() {
  const org = await getOrgContext();
  if (!org) return <main style={{ padding: 32 }}><p>Organisme introuvable.</p></main>;

  const supabase = createClient();
  const [slots, reservations] = await Promise.all([
    getAvailabilities(supabase, org.id, "coaching"),
    getReservations(supabase, org.id),
  ]);
  const booked = new Set(reservations.map((r) => r.starts_at));

  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <p style={{ marginBottom: 8 }}>
        <Link href="/mon-parcours">← Mon parcours</Link>
      </p>
      <h1>Réserver un coaching</h1>

      <h2 style={{ fontSize: 18 }}>Créneaux disponibles</h2>
      {slots.length === 0 ? (
        <p>Aucun créneau de coaching proposé pour le moment.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {slots.map((s) => (
            <li
              key={s.id}
              style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", border: "1px solid #e5e5e5", borderRadius: 8, padding: 12 }}
            >
              <span>{fmt.format(new Date(s.starts_at))}</span>
              {booked.has(s.starts_at) ? (
                <span style={{ color: "#0a7d33" }}>✓ Réservé</span>
              ) : (
                <BookButton availabilityId={s.id} />
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Mes réservations</h2>
      {reservations.length === 0 ? (
        <p>Aucune réservation pour le moment.</p>
      ) : (
        <ul>
          {reservations.map((r) => (
            <li key={r.id}>
              {r.kind === "coaching" ? "Coaching" : "Soutenance"} — {fmt.format(new Date(r.starts_at))} ({r.status})
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
