import { getOrgContext } from "@/lib/tenant";
import { requireUser } from "@/lib/auth";
import { listMyRules, listMyBlocks, getMyFeed, PUBLISH_HORIZON_DAYS } from "@/lib/data/availability";
import { RuleForm, BlockForm, FeedForm, WEEKDAYS } from "./forms";
import { deleteRuleAction, toggleRuleAction, deleteBlockAction, deleteFeedAction, publishAction } from "./actions";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";

/**
 * Écran « Mes disponibilités » (INC-19) — partagé par le portail coach et le
 * portail jury, `basePath` près. Le titulaire déclare ses plages, ses
 * exceptions et son agenda externe ; les créneaux publiés alimentent la
 * réservation côté apprenant.
 */

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
});
const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
});

const kindLabel = (kind: string | null) =>
  kind === "coaching" ? "Coaching" : kind === "defense" ? "Soutenance" : "Tous";

const weekdayLabel = (value: number) => WEEKDAYS.find((d) => d.value === value)?.label ?? "—";

export async function AvailabilityScreen({ basePath, audience }: { basePath: string; audience: "coach" | "jury" }) {
  const org = await getOrgContext();
  if (!org) return <p className="text-muted">Organisme introuvable.</p>;
  const user = await requireUser();

  const [rules, blocks, feed] = await Promise.all([
    listMyRules(org.id, user.id),
    listMyBlocks(org.id, user.id),
    getMyFeed(org.id, user.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes disponibilités"
        description={
          audience === "jury"
            ? `Vos créneaux de soutenance, proposés aux apprenants sur les ${PUBLISH_HORIZON_DAYS} prochains jours.`
            : `Vos créneaux de coaching et de soutenance, proposés aux apprenants sur les ${PUBLISH_HORIZON_DAYS} prochains jours.`
        }
        actions={
          <form action={publishAction}>
            <input type="hidden" name="basePath" value={basePath} />
            <Button type="submit" variant="secondary">Republier mes créneaux</Button>
          </form>
        }
      />

      <Card>
        <CardTitle>Plages hebdomadaires</CardTitle>
        {rules.length === 0 ? (
          <EmptyState
            title="Aucune plage déclarée"
            description="Ajoutez une plage récurrente ci-dessous : elle deviendra réservable immédiatement."
          />
        ) : (
          <Table>
            <THead>
              <Tr><Th>Jour</Th><Th>Horaire</Th><Th>Type</Th><Th>Créneau</Th><Th>État</Th><Th className="text-right">Actions</Th></Tr>
            </THead>
            <TBody>
              {rules.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium">{weekdayLabel(r.weekday)}</Td>
                  <Td className="tabular-nums">{r.startTime} – {r.endTime}</Td>
                  <Td>{kindLabel(r.kind)}</Td>
                  <Td className="tabular-nums">{r.slotMinutes} min</Td>
                  <Td>
                    <Badge tone={r.active === false ? "neutral" : "success"}>
                      {r.active === false ? "Suspendue" : "Active"}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <form action={toggleRuleAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="basePath" value={basePath} />
                        <input type="hidden" name="active" value={r.active === false ? "1" : "0"} />
                        <Button type="submit" variant="secondary" size="sm">
                          {r.active === false ? "Réactiver" : "Suspendre"}
                        </Button>
                      </form>
                      <form action={deleteRuleAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="basePath" value={basePath} />
                        <Button type="submit" variant="ghost" size="sm">Supprimer</Button>
                      </form>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        <div className="mt-5 border-t border-line pt-5">
          <RuleForm basePath={basePath} />
        </div>
      </Card>

      <Card>
        <CardTitle>Exceptions à venir</CardTitle>
        {blocks.length === 0 ? (
          <EmptyState
            title="Aucune exception"
            description="Posez une indisponibilité (congés) ou ouvrez un créneau hors de vos plages habituelles."
          />
        ) : (
          <Table>
            <THead>
              <Tr><Th>Nature</Th><Th>Du</Th><Th>Au</Th><Th>Type</Th><Th>Motif</Th><Th className="text-right">Action</Th></Tr>
            </THead>
            <TBody>
              {blocks.map((b) => (
                <Tr key={b.id}>
                  <Td>
                    <Badge tone={b.effect === "closed" ? "warning" : "brand"}>
                      {b.effect === "closed" ? "Indisponible" : "Ouverture"}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums">{dateTimeFmt.format(new Date(b.startsAt))}</Td>
                  <Td className="whitespace-nowrap tabular-nums">{dateTimeFmt.format(new Date(b.endsAt))}</Td>
                  <Td>{kindLabel(b.kind)}</Td>
                  <Td className="text-sm text-muted">{b.reason ?? "—"}</Td>
                  <Td className="text-right">
                    <form action={deleteBlockAction}>
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="basePath" value={basePath} />
                      <Button type="submit" variant="ghost" size="sm">Retirer</Button>
                    </form>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        <div className="mt-5 border-t border-line pt-5">
          <BlockForm basePath={basePath} />
        </div>
      </Card>

      <Card>
        <CardTitle>Mon agenda externe</CardTitle>
        <p className="mb-4 text-sm text-muted">
          Reliez votre agenda (Google, Outlook, iCloud…) pour que vos rendez-vous personnels
          masquent automatiquement les créneaux correspondants. Lecture seule : nous n&apos;y écrivons jamais.
        </p>

        {feed ? (
          <div className="mb-5 rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Agenda relié</p>
                <p className="truncate text-sm text-muted">
                  {/* L'URL est un secret : on n'en montre que l'hôte. */}
                  {safeHost(feed.icsUrl)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {feed.lastSyncedAt
                    ? `Dernière synchronisation : ${dateFmt.format(new Date(feed.lastSyncedAt))}` +
                      (feed.eventCount != null ? ` — ${feed.eventCount} occupation(s)` : "")
                    : "Pas encore synchronisé — la prochaine exécution s'en chargera."}
                </p>
                {feed.lastStatus && feed.lastStatus !== "ok" && (
                  <p className="mt-1 text-xs text-error">Dernière erreur : {feed.lastStatus}</p>
                )}
              </div>
              <form action={deleteFeedAction}>
                <input type="hidden" name="basePath" value={basePath} />
                <Button type="submit" variant="ghost" size="sm">Délier</Button>
              </form>
            </div>
          </div>
        ) : null}

        <FeedForm basePath={basePath} currentUrl={feed?.icsUrl ?? null} />

        <p className="mt-4 text-xs text-muted">
          Les événements répétitifs de votre agenda ne sont pas encore développés : posez une
          indisponibilité ci-dessus pour une absence récurrente.
        </p>
      </Card>
    </div>
  );
}

/** N'expose que l'hôte du lien d'agenda — le reste est un secret. */
function safeHost(url: string): string {
  try {
    return `${new URL(url).hostname} — lien masqué`;
  } catch {
    return "lien masqué";
  }
}
