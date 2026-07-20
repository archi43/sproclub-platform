import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import {
  getUpcomingDefenses,
  getServersToFree,
  getLateLearners,
  getPendingReports,
  operationsPrograms,
  SERVER_ALERT_DAYS,
  SERVER_URGENT_DAYS,
} from "@/lib/data/operations";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";

/** Module 1 / S1.1 — "Conduite de la semaine" : priorized action queue for the
 *  coordinator (direction/coordinator). Each line is an action to handle, sorted
 *  by urgency; finished dossiers are excluded. RLS is the authoritative filter. */
export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const org = await getOrgContext();
  if (!org) return <p className="text-muted">Organisme introuvable.</p>;

  const raw = searchParams.program;
  const program = (Array.isArray(raw) ? raw[0] : raw) || undefined;

  const [defenses, servers, late, reports, programs] = await Promise.all([
    getUpcomingDefenses(org.id, program),
    getServersToFree(org.id, program),
    getLateLearners(org.id, program),
    getPendingReports(org.id, program),
    operationsPrograms(org.id),
  ]);

  const juryToDo = defenses.filter((d) => d.needsJury).length;
  const urgentServers = servers.filter((s) => s.urgent).length;
  const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const fmtDate = (iso: string) => dateFmt.format(new Date(iso));
  const fmtDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));
  const learnerHref = (id: string) => `/coordination/apprenants/${id}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conduite de la semaine"
        description="Les actions à traiter, triées par urgence. Les dossiers terminés sont exclus."
      />

      {/* Résumé des urgences */}
      <div className="flex flex-wrap gap-2">
        <SummaryChip tone={juryToDo > 0 ? "warning" : "neutral"} count={juryToDo} label="jury à compléter" />
        <SummaryChip tone={urgentServers > 0 ? "danger" : "neutral"} count={urgentServers} label={`accès serveur < ${SERVER_URGENT_DAYS} j`} />
        <SummaryChip tone={late.length > 0 ? "warning" : "neutral"} count={late.length} label="apprenants en retard" />
        <SummaryChip tone={reports.length > 0 ? "warning" : "neutral"} count={reports.length} label="CR à saisir" />
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <Select name="program" defaultValue={program ?? ""} aria-label="Programme" className="w-auto">
          <option value="">Tous les programmes</option>
          {programs.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Button type="submit" size="sm">Filtrer</Button>
        {program && (
          <Link href="/coordination/operations" className="text-sm text-muted no-underline hover:underline">
            Réinitialiser
          </Link>
        )}
      </form>

      {/* Soutenances à venir */}
      <Card>
        <CardTitle>Soutenances à venir</CardTitle>
        {defenses.length === 0 ? (
          <EmptyState title="Aucune soutenance à venir" />
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Apprenant</Th><Th>Programme</Th><Th>Projet</Th><Th>Date</Th><Th>Jury</Th><Th className="text-right">Action</Th>
              </Tr>
            </THead>
            <TBody>
              {defenses.map((d) => (
                <Tr key={d.reservationId}>
                  <Td className="font-medium">{d.learnerName}</Td>
                  <Td>{d.program ?? "—"}</Td>
                  <Td>{d.projectNumber != null ? `Projet ${d.projectNumber}` : "—"}</Td>
                  <Td>{fmtDateTime(d.startsAt)}</Td>
                  <Td>
                    <Badge tone={d.needsJury ? "warning" : "success"}>
                      {d.needsJury ? `À compléter (${d.evaluatorCount}/2)` : "Complet"}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex justify-end">
                      <Link href="/coordination" className="text-sm text-brand no-underline hover:underline">
                        {d.needsJury ? "Affecter un évaluateur" : "Voir"}
                      </Link>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Serveurs à libérer */}
      <Card>
        <CardTitle>Accès serveur à libérer</CardTitle>
        {servers.length === 0 ? (
          <EmptyState title="Aucun accès à échéance" description={`Aucun accès serveur ne se termine sous ${SERVER_ALERT_DAYS} jours.`} />
        ) : (
          <Table>
            <THead>
              <Tr><Th>Apprenant</Th><Th>Programme</Th><Th>Fin d&apos;accès</Th><Th>Échéance</Th></Tr>
            </THead>
            <TBody>
              {servers.map((s) => (
                <Tr key={s.enrollmentId}>
                  <Td className="font-medium">
                    <Link href={learnerHref(s.learnerId)}>{s.learnerName}</Link>
                  </Td>
                  <Td>{s.program ?? "—"}</Td>
                  <Td>{fmtDate(s.accessEndDate)}</Td>
                  <Td>
                    <Badge tone={s.urgent ? "danger" : "warning"}>
                      {s.daysLeft <= 0 ? "Échu" : `${s.daysLeft} j`}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Apprenants en retard */}
      <Card>
        <CardTitle>Apprenants en retard</CardTitle>
        {late.length === 0 ? (
          <EmptyState title="Aucun retard" />
        ) : (
          <Table>
            <THead>
              <Tr><Th>Apprenant</Th><Th>Programme</Th><Th>Statut</Th><Th>Retard</Th></Tr>
            </THead>
            <TBody>
              {late.map((l) => (
                <Tr key={l.enrollmentId}>
                  <Td className="font-medium">
                    <Link href={learnerHref(l.learnerId)}>{l.learnerName}</Link>
                  </Td>
                  <Td>{l.program ?? "—"}</Td>
                  <Td>{l.status ?? "—"}</Td>
                  <Td className="font-medium text-error">{l.lateDays} j</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Comptes rendus à saisir */}
      <Card>
        <CardTitle>Comptes rendus à saisir</CardTitle>
        {reports.length === 0 ? (
          <EmptyState title="Aucun compte rendu en attente" />
        ) : (
          <Table>
            <THead>
              <Tr><Th>Apprenant</Th><Th>Programme</Th><Th>À saisir</Th></Tr>
            </THead>
            <TBody>
              {reports.map((r) => (
                <Tr key={r.enrollmentId}>
                  <Td className="font-medium">
                    <Link href={learnerHref(r.learnerId)}>{r.learnerName}</Link>
                  </Td>
                  <Td>{r.program ?? "—"}</Td>
                  <Td><Badge tone="warning">{r.pendingReports}</Badge></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function SummaryChip({ count, label, tone }: { count: number; label: string; tone: "neutral" | "warning" | "danger" }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm">
      <Badge tone={count > 0 ? tone : "neutral"}>{count}</Badge>
      <span className="text-muted">{label}</span>
    </span>
  );
}
