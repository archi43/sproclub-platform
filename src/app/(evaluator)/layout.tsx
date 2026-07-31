import type { ReactNode } from "react";
import { getOrgContext } from "@/lib/tenant";
import { requireOrgRole } from "@/lib/auth";
import { AppShell, PageContainer, type NavItem } from "@/components/app-shell";

const nav: NavItem[] = [
  { href: "/jury", label: "Mes disponibilités", icon: "coaching" },
];

/**
 * Portail jury + garde de rôle (INC-19). Jusqu'ici le rôle `evaluator` servait
 * au vivier et à l'affectation, sans aucune surface applicative : les
 * évaluateurs n'avaient aucun moyen de publier leurs créneaux de soutenance.
 * RLS (`0027`) reste le filtre autoritaire — chacun ne gère que ses lignes.
 */
export default async function EvaluatorLayout({ children }: { children: ReactNode }) {
  const org = await getOrgContext();
  if (!org) {
    return <PageContainer><p className="text-muted">Organisme introuvable pour ce domaine.</p></PageContainer>;
  }

  await requireOrgRole(org.id, ["evaluator"]);

  return (
    <AppShell orgName={org.name} subtitle="Espace jury" nav={nav}>
      {children}
    </AppShell>
  );
}
