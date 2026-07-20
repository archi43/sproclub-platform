import type { ReactNode } from "react";
import { getOrgContext } from "@/lib/tenant";
import { requireOrgRole } from "@/lib/auth";
import { AppShell, PageContainer, type NavItem } from "@/components/app-shell";

const nav: NavItem[] = [
  { href: "/coaching", label: "Mes apprenants", icon: "students" },
];

/**
 * Coach shell + route guard (Étape 3). Access requires the `coach` role in the
 * resolved org. RLS (tightened in 0014) remains the authoritative filter: a
 * coach only ever reads their own dossiers.
 */
export default async function CoachLayout({ children }: { children: ReactNode }) {
  const org = await getOrgContext();
  if (!org) {
    return <PageContainer><p className="text-muted">Organisme introuvable pour ce domaine.</p></PageContainer>;
  }

  await requireOrgRole(org.id, ["coach"]);

  return (
    <AppShell orgName={org.name} subtitle="Espace coach" nav={nav}>
      {children}
    </AppShell>
  );
}
