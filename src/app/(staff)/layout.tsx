import type { ReactNode } from "react";
import { getOrgContext } from "@/lib/tenant";
import { requireOrgRole } from "@/lib/auth";
import { AppShell, PageContainer, type NavItem } from "@/components/app-shell";

const nav: NavItem[] = [
  { href: "/coordination/pilotage", label: "Pilotage", icon: "dashboard" },
  { href: "/coordination/operations", label: "Opérations", icon: "operations" },
  { href: "/coordination", label: "Jurys", icon: "jury" },
  { href: "/coordination/apprenants", label: "Apprenants", icon: "learners" },
  { href: "/coordination/conformite", label: "Conformité", icon: "compliance" },
  { href: "/coordination/reporting", label: "Reporting", icon: "reporting" },
  { href: "/coordination/programmes", label: "Programmes", icon: "programs" },
  { href: "/coordination/recrutement", label: "Recrutement", icon: "recruitment" },
  { href: "/coordination/administration", label: "Administration", icon: "admin" },
  { href: "/coordination/notifications", label: "Notifications", icon: "notifications" },
  { href: "/coordination/exploitation", label: "Exploitation", icon: "ops" },
];

/**
 * Staff shell + route guard. Access requires direction or coordinator in the
 * resolved org. RLS remains the authoritative filter on the data.
 */
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const org = await getOrgContext();
  if (!org) {
    return <PageContainer><p className="text-muted">Organisme introuvable pour ce domaine.</p></PageContainer>;
  }

  await requireOrgRole(org.id, ["direction", "coordinator"]);

  return (
    <AppShell orgName={org.name} subtitle="Coordination" nav={nav}>
      {children}
    </AppShell>
  );
}
