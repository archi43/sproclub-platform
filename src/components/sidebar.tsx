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

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
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
              "flex min-h-[40px] items-center gap-3 rounded-lg px-3 py-2 text-sm no-underline transition-colors",
              active
                ? "bg-brand-tint font-medium text-brand"
                : "text-muted hover:bg-surface hover:text-ink"
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
function SidebarInner({ orgName, subtitle, nav, onNavigate }: {
  orgName: string; subtitle?: string; nav: NavItem[]; onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col p-3">
      <div className="flex items-center gap-2.5 px-2 py-3">
        <BrandMark size="md" />
        <div className="min-w-0">
          <p className="truncate font-heading text-sm font-semibold text-ink">{orgName}</p>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-2 flex-1 overflow-y-auto">
        <NavLinks items={nav} onNavigate={onNavigate} />
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <SignOutButton className="w-full justify-start" />
      </div>
    </div>
  );
}

export function Sidebar({ orgName, subtitle, nav }: { orgName: string; subtitle?: string; nav: NavItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Rail fixe (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-white lg:block">
        <SidebarInner orgName={orgName} subtitle={subtitle} nav={nav} />
      </aside>

      {/* Barre supérieure (mobile) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/85 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2.5">
          <BrandMark size="sm" />
          <span className="font-heading text-sm font-semibold text-ink">{orgName}</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir la navigation"
          aria-expanded={open}
          className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink"
        >
          <Menu aria-hidden className="h-5 w-5" />
        </button>
      </header>

      {/* Tiroir (mobile) */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white shadow-xl"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer la navigation"
              className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink"
            >
              <X aria-hidden className="h-5 w-5" />
            </button>
            <SidebarInner orgName={orgName} subtitle={subtitle} nav={nav} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
