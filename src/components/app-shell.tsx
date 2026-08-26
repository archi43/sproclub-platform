import type { ReactNode } from "react";
import { Sidebar, type NavItem, type ShellTone } from "@/components/sidebar";

export type { NavItem, ShellTone };

/** Skip-to-content link — first focusable element, hidden until focused. Lets
 *  keyboard/screen-reader users jump past the nav to the page content. */
function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand focus:shadow"
    >
      Aller au contenu
    </a>
  );
}

/**
 * App shell (direction « Poste de pilotage ») : rail de navigation à gauche sur
 * desktop, barre + tiroir sur mobile. Le contenu occupe la colonne principale,
 * sur un plan de travail clair quel que soit le ton du rail.
 *
 * `tone` vaut `navy` pour les rôles qui opèrent (coordination, coach, jury) et
 * `light` pour les rôles invités (apprenant, entreprise partenaire).
 */
export function AppShell({ orgName, subtitle, nav, tone = "navy", children }: {
  orgName: string; subtitle?: string; nav: NavItem[]; tone?: ShellTone; children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface lg:flex">
      <SkipLink />
      <Sidebar orgName={orgName} subtitle={subtitle} nav={nav} tone={tone} />
      <div className="min-w-0 flex-1">
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl scroll-mt-4 px-5 py-8 focus:outline-none sm:px-6 lg:px-10 lg:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

/** Conteneur simple pour les états sans shell (fallback « organisme introuvable »). */
export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-6 py-8 focus:outline-none">
      {children}
    </main>
  );
}
