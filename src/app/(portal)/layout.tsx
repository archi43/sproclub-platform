import type { ReactNode } from "react";
import { getOrgContext } from "@/lib/tenant";
import { requireOrgRole } from "@/lib/auth";
import { AppHeader, PageContainer, type NavItem } from "@/components/app-shell";

const nav: NavItem[] = [
  { href: "/mon-parcours", label: "Mon parcours" },
  { href: "/mon-parcours/dossier", label: "Mon dossier" },
  { href: "/mon-parcours/livrables", label: "Mes livrables" },
  { href: "/mon-parcours/reservation", label: "Coaching" },
  { href: "/mon-parcours/soutenance", label: "Soutenance" },
  { href: "/mon-parcours/offres", label: "Offres d'emploi" },
  { href: "/mon-parcours/visibilite", label: "Visibilité entreprises" },
];

/**
 * Student portal shell + route guard.
 * Access requires an authenticated `student` member of the resolved org. RLS
 * remains the authoritative filter on the data; this guard governs navigation.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const org = await getOrgContext();
  if (!org) {
    return <PageContainer><p className="text-grey-600">Organisme introuvable pour ce domaine.</p></PageContainer>;
  }

  await requireOrgRole(org.id, ["student"]);

  return (
    <div>
      <AppHeader orgName={org.name} subtitle="Espace apprenant" nav={nav} />
      <PageContainer>{children}</PageContainer>
    </div>
  );
}
