import type { ReactNode } from "react";
import { getOrgContext } from "@/lib/tenant";
import { requireOrgRole } from "@/lib/auth";
import { AppShell, PageContainer, type NavItem } from "@/components/app-shell";

const nav: NavItem[] = [
  { href: "/mon-parcours", label: "Mon parcours", icon: "path" },
  { href: "/mon-parcours/dossier", label: "Mon dossier", icon: "dossier" },
  { href: "/mon-parcours/livrables", label: "Mes livrables", icon: "deliverables" },
  { href: "/mon-parcours/reservation", label: "Coaching", icon: "coaching" },
  { href: "/mon-parcours/soutenance", label: "Soutenance", icon: "defense" },
  { href: "/mon-parcours/offres", label: "Offres d'emploi", icon: "jobs" },
  { href: "/mon-parcours/visibilite", label: "Visibilité entreprises", icon: "visibility" },
];

/**
 * Student portal shell + route guard.
 * Access requires an authenticated `student` member of the resolved org. RLS
 * remains the authoritative filter on the data; this guard governs navigation.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const org = await getOrgContext();
  if (!org) {
    return <PageContainer><p className="text-muted">Organisme introuvable pour ce domaine.</p></PageContainer>;
  }

  await requireOrgRole(org.id, ["student"]);

  return (
    <AppShell orgName={org.name} subtitle="Espace apprenant" nav={nav}>
      {children}
    </AppShell>
  );
}
