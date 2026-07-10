import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { recentNotifications, notificationsSummary, listOptOuts } from "@/lib/data/notifications";
import { kindLabel } from "@/lib/notification-rules";
import { OptOutManager } from "./prefs-ui";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";

const fmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
});

const STATUSES = ["pending", "sent", "skipped", "error"] as const;
const statusTone: Record<string, "success" | "warning" | "neutral" | "danger"> = {
  sent: "success",
  pending: "warning",
  skipped: "neutral",
  error: "danger",
};
const statusLabel: Record<string, string> = { sent: "Envoyé", pending: "En attente", skipped: "Ignoré", error: "Erreur" };

/** Module notifications (INC-7) — journal d'envoi des relances. Direction/
 *  coordinator (staff layout). Lecture RLS bornée à l'organisme. */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const org = await getOrgContext();
  if (!org) return <p className="text-grey-600">Organisme introuvable.</p>;

  const raw = searchParams.status;
  const statusParam = (Array.isArray(raw) ? raw[0] : raw) || undefined;
  const status = (STATUSES as readonly string[]).includes(statusParam ?? "") ? statusParam : undefined;

  const [summary, rows, optOuts] = await Promise.all([
    notificationsSummary(org.id),
    recentNotifications(org.id, { status }),
    listOptOuts(org.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Journal des relances automatiques envoyées aux apprenants et coachs." />

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Envoyées" value={summary.sent} />
        <Tile label="En attente" value={summary.pending} tone={summary.pending > 0 ? "warning" : undefined} />
        <Tile label="Erreurs" value={summary.errors} tone={summary.errors > 0 ? "danger" : undefined} />
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <Select name="status" defaultValue={status ?? ""} aria-label="Statut" className="w-auto">
          <option value="">Tous les statuts</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{statusLabel[s]}</option>
          ))}
        </Select>
        <Button type="submit" size="sm">Filtrer</Button>
        {status && (
          <Link href="/coordination/notifications" className="text-sm text-grey-600 no-underline hover:underline">
            Réinitialiser
          </Link>
        )}
      </form>

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Aucune notification" description="Les relances automatiques apparaîtront ici une fois le traitement exécuté." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th>Destinataire</Th>
                  <Th>Objet</Th>
                  <Th>Statut</Th>
                </Tr>
              </THead>
              <TBody>
                {rows.map((n) => (
                  <Tr key={n.id}>
                    <Td className="whitespace-nowrap tabular-nums">{fmt.format(new Date(n.sentAt ?? n.createdAt))}</Td>
                    <Td className="whitespace-nowrap">{kindLabel(n.kind)}</Td>
                    <Td className="whitespace-nowrap">{n.recipientEmail}</Td>
                    <Td>{n.subject}</Td>
                    <Td>
                      <Badge tone={statusTone[n.status] ?? "neutral"}>{statusLabel[n.status] ?? n.status}</Badge>
                      {n.status === "error" && n.error && <span className="ml-2 text-xs text-grey-600">{n.error}</span>}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Préférences (opt-out)</CardTitle>
        <p className="mb-3 text-sm text-grey-600">
          Désactivez une relance pour un destinataire précis. Les envois correspondants seront ignorés.
        </p>
        <OptOutManager optOuts={optOuts} />
      </Card>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "warning" | "danger" }) {
  const color = tone === "danger" ? "text-error" : tone === "warning" ? "text-warning" : "text-brand";
  return (
    <Card>
      <div className="text-xs text-grey-600">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</div>
    </Card>
  );
}
