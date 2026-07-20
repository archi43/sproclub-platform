import type { ReactNode } from "react";
import { getOrgContext } from "@/lib/tenant";
import { requireOrgRole } from "@/lib/auth";
import { AppShell, PageContainer, type NavItem } from "@/components/app-shell";

const nav: NavItem[] = [
  { href: "/vivier", label: "Vivier de talents", icon: "talent" },
  { href: "/offres", label: "Mes offres", icon: "jobs" },
  { href: "/besoins", label: "Besoins de formation", icon: "needs" },
];

/**
 * Partner shell + route guard (INC-17). Access requires the `partner` role in
 * the resolved org. La vue `talent_pool` (0025) reste le vrai garde-fou : un
 * partenaire ne voit que les candidats CONSENTANTS de l'organisme, en synthèse
 * chiffrée — jamais les tables sous-jacentes.
 */
export default async function PartnerLayout({ children }: { children: ReactNode }) {
  const org = await getOrgContext();
  if (!org) {
    return <PageContainer><p className="text-muted">Organisme introuvable pour ce domaine.</p></PageContainer>;
  }

  await requireOrgRole(org.id, ["partner"]);

  return (
    <AppShell orgName={org.name} subtitle="Espace entreprise partenaire" nav={nav}>
      {children}
    </AppShell>
  );
}
