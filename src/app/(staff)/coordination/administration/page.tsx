import { getOrgContext } from "@/lib/tenant";
import { getRolesForOrg } from "@/lib/auth";
import { listMembers } from "@/lib/data/members";
import { listEvaluatorPool, listEvaluatorCandidates } from "@/lib/data/evaluators";
import { listPrograms } from "@/lib/data/programs";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { ROLE_ORDER } from "@/lib/roles";
import type { AppRole } from "@/lib/types";
import {
  InviteForm,
  AddRoleForm,
  RoleChip,
  AccountToggle,
  AddPoolForm,
  RemovePoolButton,
} from "./admin-ui";

/**
 * INC-10 — user & role management (direction / coordinator). Invite and
 * deactivate accounts, grant / revoke per-org roles, and administer the
 * evaluator pool that feeds jury assignment. RLS is the authoritative guard.
 */
export default async function AdministrationPage() {
  const org = await getOrgContext();
  if (!org) return <p className="text-grey-600">Organisme introuvable.</p>;

  const [members, pool, candidates, programs, roles] = await Promise.all([
    listMembers(org.id),
    listEvaluatorPool(org.id),
    listEvaluatorCandidates(org.id),
    listPrograms(org.id),
    getRolesForOrg(org.id),
  ]);
  const isDirection = roles.includes("direction");
  const programNames = programs.map((p) => p.name);

  return (
    <div className="space-y-10">
      <div className="space-y-6">
        <PageHeader
          title="Utilisateurs et rôles"
          description="Invitez, désactivez et gérez les rôles des membres de l'organisme."
        />

        <Card>
          <CardTitle>Inviter un utilisateur</CardTitle>
          <p className="mb-3 text-sm text-grey-600">
            Un compte est créé et la personne se connecte via le lien e-mail. Le rôle définit son périmètre d'accès.
          </p>
          <InviteForm canCreateDirection={isDirection} />
        </Card>

        {members.length === 0 ? (
          <EmptyState title="Aucun membre" description="Invitez le premier utilisateur ci-dessus." />
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Membre</Th>
                <Th>Rôles</Th>
                <Th>Statut</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </THead>
            <TBody>
              {members.map((m) => {
                const available: AppRole[] = ROLE_ORDER.filter(
                  (r) => !m.roles.includes(r) && (isDirection || r !== "direction")
                );
                return (
                  <Tr key={m.profileId} className={m.active ? undefined : "opacity-70"}>
                    <Td>
                      <div className="font-medium text-ink">{m.fullName ?? "—"}</div>
                      <div className="text-xs text-grey-600">{m.email}</div>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {m.roles.map((r) => (
                          <RoleChip
                            key={r}
                            profileId={m.profileId}
                            role={r}
                            tone={r === "direction" ? "brand" : "neutral"}
                            removable={isDirection || r !== "direction"}
                          />
                        ))}
                      </div>
                      {m.active && (
                        <div className="mt-2">
                          <AddRoleForm profileId={m.profileId} available={available} />
                        </div>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={m.active ? "success" : "warning"}>{m.active ? "Actif" : "Désactivé"}</Badge>
                    </Td>
                    <Td>
                      <div className="flex justify-end">
                        <AccountToggle profileId={m.profileId} active={m.active} />
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>

      <div className="space-y-6">
        <PageHeader
          title="Vivier d'évaluateurs"
          description="Composez le vivier par programme. Il alimente l'affectation du jury (jamais le coach de l'apprenant)."
        />

        <Card>
          <CardTitle>Ajouter un évaluateur au vivier</CardTitle>
          <AddPoolForm programs={programNames} candidates={candidates} />
        </Card>

        {pool.length === 0 ? (
          <EmptyState
            title="Vivier vide"
            description="Ajoutez des évaluateurs par programme ci-dessus pour permettre l'affectation des jurys."
          />
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Programme</Th>
                <Th>Évaluateur</Th>
                <Th className="text-right">Action</Th>
              </Tr>
            </THead>
            <TBody>
              {pool.map((e) => (
                <Tr key={`${e.program}:${e.evaluatorId}`}>
                  <Td className="font-medium">{e.program}</Td>
                  <Td>
                    <div className="text-ink">{e.fullName ?? "—"}</div>
                    <div className="text-xs text-grey-600">{e.email}</div>
                  </Td>
                  <Td>
                    <div className="flex justify-end">
                      <RemovePoolButton program={e.program} evaluatorId={e.evaluatorId} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
