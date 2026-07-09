import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/sign-out-button";

export interface NavItem {
  href: string;
  label: string;
}

/** Common app header: brand shield, org name, role nav, user menu. */
export function AppHeader({ orgName, subtitle, nav }: { orgName: string; subtitle?: string; nav?: NavItem[] }) {
  return (
    <header className="border-b border-grey-300/60 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-md bg-brand text-xs font-bold text-white">
            SC
          </span>
          <span className="font-heading text-lg font-bold text-brand">{orgName}</span>
          {subtitle && <span className="hidden text-sm text-grey-600 sm:inline">· {subtitle}</span>}
        </div>
        <SignOutButton />
      </div>
      {nav && nav.length > 0 && (
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 sm:px-4" aria-label="Navigation principale">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium text-grey-600 no-underline hover:bg-brand-tint hover:text-brand"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>;
}
