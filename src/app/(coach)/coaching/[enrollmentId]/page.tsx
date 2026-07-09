import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { getCoachDossier } from "@/lib/data/coaching";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { ReportForm } from "./report-form";

const dtFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
const dtTimeFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtDate = (iso: string | null) => (iso ? dtFmt.format(new Date(iso)) : "—");
const fmtDateTime = (iso: string) => dtTimeFmt.format(new Date(iso));

/** Coach dossier detail: advancement, planning (bookings), defenses, documents,
 *  and the coach's session reports. RLS returns nothing if it isn't their
 *  dossier → we render a not-found message. */
export default async function CoachDossierPage({ params }: { params: { enrollmentId: string } }) {
  const org = await getOrgContext();
  if (!org) return <p className="text-grey-600">Organisme introuvable.</p>;

  const dossier = await getCoachDossier(org.id, params.enrollmentId);
  if (!dossier) {
    return (
      <div className="space-y-4">
        <Link href="/coaching" className="text-sm text-brand no-underline hover:underline">← Mes apprenants</Link>
        <EmptyState title="Dossier introuvable" description="Ce dossier n'est pas dans votre portefeuille." />
      </div>
    );
  }

  const { enrollment: e, reservations, deliverables, reports } = dossier;
  const defenses = reservations.filter((r) => r.kind === "defense");
  const coachings = reservations.filter((r) => r.kind === "coaching");

  return (
    <div className="space-y-6">
      <Link href="/coaching" className="text-sm text-brand no-underline hover:underline">← Mes apprenants</Link>
      <PageHeader
        title={e.learnerName}
        description={[e.program, e.specialty].filter(Boolean).join(" · ") || undefined}
      />

      {/* Avancement */}
      <Card>
        <CardTitle>Avancement</CardTitle>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <Stat label="Statut" value={e.status ?? "—"} />
          <Stat label="Avancement" value={e.progress != null ? `${Math.round(e.progress * 100)}%` : "—"} />
          <Stat label="Retard" value={e.lateDays != null ? `${e.lateDays} j` : "—"} tone={(e.lateDays ?? 0) > 0 ? "error" : undefined} />
          <Stat label="Projets validés" value={`${e.projectsValidated ?? 0}/${e.projectsRequired ?? "—"}`} />
          <Stat label="Début" value={fmtDate(e.startDate)} />
          <Stat label="Fin d'accès" value={fmtDate(e.accessEndDate)} />
        </dl>
      </Card>

      {/* Planning & soutenances */}
      <Card>
        <CardTitle>Planning &amp; soutenances</CardTitle>
        {reservations.length === 0 ? (
          <EmptyState title="Aucun rendez-vous" />
        ) : (
          <Table>
            <THead>
              <Tr><Th>Type</Th><Th>Projet</Th><Th>Date</Th><Th>Statut</Th></Tr>
            </THead>
            <TBody>
              {[...defenses, ...coachings].map((r) => (
                <Tr key={r.id}>
                  <Td>{r.kind === "defense" ? "Soutenance" : "Coaching"}</Td>
                  <Td>{r.projectNumber != null ? `Projet ${r.projectNumber}` : "—"}</Td>
                  <Td>{fmtDateTime(r.startsAt)}</Td>
                  <Td><Badge tone={r.status === "confirmed" ? "success" : r.status === "cancelled" || r.status === "declined" ? "danger" : "warning"}>{r.status}</Badge></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Documents / livrables */}
      <Card>
        <CardTitle>Livrables</CardTitle>
        {deliverables.length === 0 ? (
          <EmptyState title="Aucun livrable" />
        ) : (
          <Table>
            <THead>
              <Tr><Th>Projet</Th><Th>Déposé</Th><Th>Document</Th></Tr>
            </THead>
            <TBody>
              {deliverables.map((d) => (
                <Tr key={d.id}>
                  <Td>Projet {d.projectNumber}</Td>
                  <Td><Badge tone={d.submitted ? "success" : "warning"}>{d.submitted ? "Oui" : "Non"}</Badge></Td>
                  <Td>
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">Ouvrir</a>
                    ) : "—"}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Comptes rendus */}
      <Card>
        <CardTitle>Comptes rendus de coaching</CardTitle>
        <div className="mb-5">
          <ReportForm enrollmentId={e.enrollmentId} />
        </div>
        {reports.length === 0 ? (
          <EmptyState title="Aucun compte rendu" description="Ajoutez votre premier compte rendu ci-dessus." />
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="rounded-lg border border-grey-300 bg-surface p-3">
                <div className="mb-1 flex items-center gap-2 text-xs text-grey-600">
                  <span>{fmtDate(r.sessionDate ?? r.createdAt)}</span>
                  {r.grade != null && <Badge tone="brand">Note {r.grade}</Badge>}
                </div>
                <p className="whitespace-pre-wrap text-sm text-ink">{r.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "error" }) {
  return (
    <div>
      <dt className="text-xs text-grey-600">{label}</dt>
      <dd className={tone === "error" ? "font-medium text-error" : "font-medium text-ink"}>{value}</dd>
    </div>
  );
}
