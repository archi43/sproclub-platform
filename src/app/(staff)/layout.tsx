import type { ReactNode } from "react";
import { getOrgContext } from "@/lib/tenant";
import { requireOrgRole } from "@/lib/auth";
import { AppHeader, PageContainer, type NavItem } from "@/components/app-shell";

const nav: NavItem[] = [
  { href: "/coordination/pilotage", label: "Pilotage" },
  { href: "/coordination/operations", label: "Opérations" },
  { href: "/coordination", label: "Jurys" },
  { href: "/coordination/apprenants", label: "Apprenants" },
  { href: "/coordination/conformite", label: "Conformité" },
  { href: "/coordination/reporting", label: "Reporting" },
  { href: "/coordination/programmes", label: "Programmes" },
  { href: "/coordination/recrutement", label: "Recrutement" },
  { href: "/coordination/administration", label: "Administration" },
  { href: "/coordination/notifications", label: "Notifications" },
  { href: "/coordination/exploitation", label: "Exploitation" },
];

/**
 * Staff shell + route guard. Access requires direction or coordinator in the
 * resolved org. RLS remains the authoritative filter on the data.
 */
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const org = await getOrgContext();
  if (!org) {
    return <PageContainer><p className="text-grey-600">Organisme introuvable pour ce domaine.</p></PageContainer>;
  }

  await requireOrgRole(org.id, ["direction", "coordinator"]);

  return (
    <div>
      <AppHeader orgName={org.name} subtitle="Coordination" nav={nav} />
      <PageContainer>{children}</PageContainer>
    </div>
  );
}
