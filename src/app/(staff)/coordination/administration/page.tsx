import { getOrgContext } from "@/lib/tenant";
import { getRolesForOrg } from "@/lib/auth";
import { listMembers } from "@/lib/data/members";
import { listAccessDecisions } from "@/lib/data/access";
import { listEvaluatorPool, listEvaluatorCandidates } from "@/lib/data/evaluators";
import { listPartnerCompanies } from "@/lib/data/talent";
import { listPrograms } from "@/lib/data/programs";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { MANUAL_INVITE_ROLES } from "@/lib/roles";
import type { AppRole } from "@/lib/types";
import {
  InviteForm,
  AddRoleForm,
  RoleChip,
  AccountToggle,
  AddPoolForm,
  RemovePoolButton,
  PartnerCompanyForm,
} from "./admin-ui";

/** Libellés des décisions du rapprochement d'accès (INC-29). */
const ACCESS_LABELS: Record<string, string> = {
  create: "Compte créé",
  grant: "Rôle ajouté",
  reactivate: "Accès rétabli",
  deactivate: "Accès coupé",
  skip: "Écartée",
};

/** Tons : la coupure et l'écart doivent se voir, l'ouverture est une routine. */
const ACCESS_TONES: Record<string, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  create: "success",
  grant: "success",
  reactivate: "success",
  deactivate: "danger",
  skip: "warning",
};

/**
 * INC-10 — user & role management (direction / coordinator), remanié par INC-29 :
 * l'annuaire Airtable décide des identités et des rôles, cet écran ne gère plus
 * que les comptes de service, le vivier d'évaluateurs et les entreprises
 * partenaires. Il rend compte des décisions de la synchronisation. La RLS reste
 * le garde-fou autoritaire (0012 pour les rôles, 0031 pour la provenance).
 */
export default async function AdministrationPage() {
  const org = await getOrgContext();
  if (!org) return <p className="text-muted">Organisme introuvable.</p>;

  const [members, pool, candidates, programs, roles, partnerCompanies, decisions] = await Promise.all([
    listMembers(org.id),
    listEvaluatorPool(org.id),
    listEvaluatorCandidates(org.id),
    listPrograms(org.id),
    getRolesForOrg(org.id),
    listPartnerCompanies(org.id),
    listAccessDecisions(org.id),
  ]);
  const isDirection = roles.includes("direction");
  const programNames = programs.map((p) => p.name);

  return (
    <div className="space-y-10">
      <div className="space-y-6">
        <PageHeader
          title="Utilisateurs et rôles"
          description="Les apprenants, coachs et évaluateurs reflètent les habilitations du back office. Cet écran gère les comptes de service et le vivier."
        />

        <Alert tone="info">
          Les accès des apprenants, des coachs et des évaluateurs se déclarent dans Airtable
          («&nbsp;Contacts&nbsp;» et «&nbsp;Habilitations&nbsp;»). La plateforme s'y aligne à chaque
          synchronisation&nbsp;: un rôle accordé y ouvre l'accès, une habilitation expirée le coupe.
          Les comptes marqués «&nbsp;Airtable&nbsp;» ci-dessous ne se modifient donc pas ici.
        </Alert>

        <Card>
          <CardTitle>Créer un compte de service</CardTitle>
          <p className="mb-3 text-sm text-muted">
            Réservé aux comptes qui n'appartiennent pas à l'annuaire&nbsp;: pilotage (direction,
            coordination) et entreprise partenaire. Un compte de pilotage reste nécessaire pour que
            la plateforme demeure administrable si l'annuaire est indisponible.
          </p>
          <InviteForm canCreateDirection={isDirection} partnerCompanies={partnerCompanies.filter((c) => c.active)} />
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
                const available: AppRole[] = MANUAL_INVITE_ROLES.filter(
                  // partner : jamais via l'ajout de rôle générique — uniquement
                  // l'invitation dédiée avec entreprise (revérifié côté action).
                  (r) => !m.roles.includes(r) && (isDirection || r !== "direction") && r !== "partner"
                );
                return (
                  <Tr key={m.profileId} className={m.active ? undefined : "opacity-70"}>
                    <Td>
                      <div className="font-medium text-ink">{m.fullName ?? "—"}</div>
                      <div className="text-xs text-muted">{m.email}</div>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {m.roles.map((r) => (
                          <RoleChip
                            key={r}
                            profileId={m.profileId}
                            role={r}
                            tone={r === "direction" ? "brand" : "neutral"}
                            // Un rôle issu d'une habilitation ne se retire pas ici :
                            // la RLS (0031) le refuserait, et le retirer à l'écran
                            // laisserait croire que la décision a été prise.
                            removable={
                              !m.syncedRoles.includes(r) && (isDirection || r !== "direction")
                            }
                          />
                        ))}
                      </div>
                      {m.active && !m.managedByAirtable && (
                        <div className="mt-2">
                          <AddRoleForm profileId={m.profileId} available={available} />
                        </div>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={m.active ? "success" : "warning"}>{m.active ? "Actif" : "Désactivé"}</Badge>
                        <Badge tone={m.managedByAirtable ? "brand" : "neutral"}>
                          {m.managedByAirtable ? "Airtable" : "Compte de service"}
                        </Badge>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex justify-end">
                        {m.managedByAirtable ? (
                          <span className="text-xs text-muted">Géré dans le back office</span>
                        ) : (
                          <AccountToggle profileId={m.profileId} active={m.active} />
                        )}
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
          title="Décisions d'accès"
          description="Ce que la synchronisation a décidé depuis les habilitations du back office, le plus récent d'abord."
        />

        {decisions.length === 0 ? (
          <EmptyState
            title="Aucun mouvement d'accès"
            description="La synchronisation n'a encore ouvert ni coupé aucun accès. Un passage sans effet ne laisse pas de trace."
          />
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Décision</Th>
                <Th>Personne</Th>
                <Th>Rôle</Th>
                <Th>Motif</Th>
                <Th>Date</Th>
              </Tr>
            </THead>
            <TBody>
              {decisions.map((d, i) => (
                <Tr key={`${d.at}:${d.email}:${d.role}:${i}`}>
                  <Td>
                    <Badge tone={ACCESS_TONES[d.action]}>{ACCESS_LABELS[d.action]}</Badge>
                  </Td>
                  <Td className="text-xs text-muted">{d.email || "—"}</Td>
                  <Td>{d.role}</Td>
                  <Td className="text-sm text-muted">{d.reason ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-sm text-muted">
                    {new Date(d.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  </Td>
                </Tr>
              ))}
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
                    <div className="text-xs text-muted">{e.email}</div>
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

      <div className="space-y-6">
        <PageHeader
          title="Entreprises partenaires"
          description="Les entreprises partenaires accèdent au vivier de talents (candidats consentants, synthèse chiffrée en temps réel). Créez l'entreprise puis invitez ses comptes avec le rôle « Entreprise partenaire »."
        />
        <Card>
          <CardTitle>Créer une entreprise partenaire</CardTitle>
          <PartnerCompanyForm />
        </Card>
        {partnerCompanies.length === 0 ? (
          <EmptyState title="Aucune entreprise partenaire" description="Créez la première entreprise ci-dessus." />
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Entreprise</Th>
                <Th>Statut</Th>
                <Th>Depuis</Th>
              </Tr>
            </THead>
            <TBody>
              {partnerCompanies.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium text-ink">{c.name}</Td>
                  <Td><Badge tone={c.active ? "success" : "neutral"}>{c.active ? "Active" : "Inactive"}</Badge></Td>
                  <Td>{new Date(c.createdAt).toLocaleDateString("fr-FR")}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
