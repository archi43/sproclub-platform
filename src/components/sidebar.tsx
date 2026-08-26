"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ListChecks, Scale, GraduationCap, ShieldCheck, BarChart3,
  BookOpen, Briefcase, Settings, Bell, Activity, Route, FolderOpen, FileText,
  CalendarClock, Presentation, Eye, Users, Sparkles, Menu, X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveActiveHref } from "@/lib/nav-active";
import { BrandMark } from "@/components/ui/brand-mark";
import { SignOutButton } from "@/components/sign-out-button";

/** Icon keys are serializable (server → client): the registry resolves them to
 *  lucide components on the client. */
export type IconName =
  | "dashboard" | "operations" | "jury" | "learners" | "compliance" | "reporting"
  | "programs" | "recruitment" | "admin" | "notifications" | "ops" | "path"
  | "dossier" | "deliverables" | "coaching" | "defense" | "jobs" | "visibility"
  | "talent" | "needs" | "students";

const ICONS: Record<IconName, LucideIcon> = {
  dashboard: LayoutDashboard, operations: ListChecks, jury: Scale,
  learners: GraduationCap, compliance: ShieldCheck, reporting: BarChart3,
  programs: BookOpen, recruitment: Briefcase, admin: Settings,
  notifications: Bell, ops: Activity, path: Route, dossier: FolderOpen,
  deliverables: FileText, coaching: CalendarClock, defense: Presentation,
  jobs: Briefcase, visibility: Eye, talent: Sparkles, needs: GraduationCap,
  students: Users,
};

export interface NavItem {
  href: string;
  label: string;
  icon?: IconName;
}

/**
 * Ton de la coque (direction « Poste de pilotage ») :
 * - `navy` pour les rôles qui **opèrent** la plateforme (coordination, coach,
 *   jury) : le rail sombre donne à l'outil une silhouette reconnaissable et
 *   servira de support à la marque d'un autre organisme à l'étape 7 ;
 * - `light` pour les rôles **invités** (apprenant, entreprise partenaire) : un
 *   apprenant en formation n'a pas à se retrouver dans un poste de conduite.
 * Les composants en dessous sont les mêmes.
 */
export type ShellTone = "navy" | "light";

interface ToneStyles {
  rail: string;
  bar: string;
  drawer: string;
  orgName: string;
  subtitle: string;
  navIdle: string;
  navActive: string;
  divider: string;
  iconButton: string;
  brand: "onLight" | "onDark";
  signOut: "secondary" | "shell";
}

const TONES: Record<ShellTone, ToneStyles> = {
  navy: {
    rail: "border-r border-shell-line bg-shell",
    bar: "border-b border-shell-line bg-shell",
    drawer: "bg-shell",
    orgName: "text-shell-fg-strong",
    subtitle: "text-shell-fg",
    // Le marqueur rouge à gauche double la couleur de fond : l'état actif n'est
    // jamais porté par la seule couleur (RGAA).
    navIdle: "border-l-[3px] border-transparent text-shell-fg hover:bg-shell-item hover:text-shell-fg-strong",
    navActive: "border-l-[3px] border-accent bg-shell-item font-medium text-shell-fg-strong",
    divider: "border-t border-shell-line",
    iconButton: "text-shell-fg hover:bg-shell-item hover:text-shell-fg-strong",
    brand: "onDark",
    signOut: "shell",
  },
  light: {
    rail: "border-r border-line bg-white",
    bar: "border-b border-line bg-white/85 backdrop-blur",
    drawer: "bg-white",
    orgName: "text-ink",
    subtitle: "text-muted",
    navIdle: "border-l-[3px] border-transparent text-muted hover:bg-surface hover:text-ink",
    navActive: "border-l-[3px] border-accent bg-brand-tint font-medium text-brand",
    divider: "border-t border-line",
    iconButton: "text-muted hover:bg-surface hover:text-ink",
    brand: "onLight",
    signOut: "secondary",
  },
};

function NavLinks({ items, tone, onNavigate }: { items: NavItem[]; tone: ToneStyles; onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeHref = resolveActiveHref(pathname, items.map((n) => n.href));

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Navigation principale">
      {items.map((n) => {
        const active = n.href === activeHref;
        const Icon = n.icon ? ICONS[n.icon] : null;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-[40px] items-center gap-3 rounded-r-lg py-2 pl-3 pr-3 text-sm no-underline transition-colors",
              active ? tone.navActive : tone.navIdle
            )}
          >
            {Icon && <Icon aria-hidden className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.25 : 2} />}
            <span className="truncate">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Brand + nav + sign-out — shared by the desktop rail and the mobile drawer. */
function SidebarInner({ orgName, subtitle, nav, tone, onNavigate }: {
  orgName: string; subtitle?: string; nav: NavItem[]; tone: ToneStyles; onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col py-3 pr-3">
      <div className="flex items-center gap-2.5 px-3 py-3">
        <BrandMark size="md" tone={tone.brand} />
        <div className="min-w-0">
          <p className={cn("truncate font-heading text-sm font-semibold", tone.orgName)}>{orgName}</p>
          {subtitle && <p className={cn("truncate text-xs", tone.subtitle)}>{subtitle}</p>}
        </div>
      </div>
      <div className="mt-2 flex-1 overflow-y-auto">
        <NavLinks items={nav} tone={tone} onNavigate={onNavigate} />
      </div>
      <div className={cn("ml-3 mt-3 pt-3", tone.divider)}>
        <SignOutButton className="w-full justify-start" variant={tone.signOut} />
      </div>
    </div>
  );
}

export function Sidebar({ orgName, subtitle, nav, tone = "navy" }: {
  orgName: string; subtitle?: string; nav: NavItem[]; tone?: ShellTone;
}) {
  const [open, setOpen] = useState(false);
  const t = TONES[tone];

  return (
    <>
      {/* Rail fixe (desktop) */}
      <aside className={cn("sticky top-0 hidden h-screen w-64 shrink-0 lg:block", t.rail)}>
        <SidebarInner orgName={orgName} subtitle={subtitle} nav={nav} tone={t} />
      </aside>

      {/* Barre supérieure (mobile) */}
      <header className={cn("sticky top-0 z-30 flex items-center justify-between px-4 py-2.5 lg:hidden", t.bar)}>
        <div className="flex items-center gap-2.5">
          <BrandMark size="sm" tone={t.brand} />
          <span className={cn("font-heading text-sm font-semibold", t.orgName)}>{orgName}</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir la navigation"
          aria-expanded={open}
          className={cn("grid h-9 w-9 place-items-center rounded-lg", t.iconButton)}
        >
          <Menu aria-hidden className="h-5 w-5" />
        </button>
      </header>

      {/* Tiroir (mobile) */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className={cn("absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-xl", t.drawer)}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer la navigation"
              className={cn("absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg", t.iconButton)}
            >
              <X aria-hidden className="h-5 w-5" />
            </button>
            <SidebarInner orgName={orgName} subtitle={subtitle} nav={nav} tone={t} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
