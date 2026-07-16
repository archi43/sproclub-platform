import type { ReactNode } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { NavTabs } from "@/components/nav-tabs";
import { BrandMark } from "@/components/ui/brand-mark";

export interface NavItem {
  href: string;
  label: string;
}

/** Skip-to-content link — first focusable element, hidden until focused. Lets
 *  keyboard/screen-reader users jump past the header nav to the page content. */
function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand"
    >
      Aller au contenu
    </a>
  );
}

/** Common app header: navy band (charte SproCLUB), brand mark, org name, role nav. */
export function AppHeader({ orgName, subtitle, nav }: { orgName: string; subtitle?: string; nav?: NavItem[] }) {
  return (
    <header className="relative bg-brand text-white shadow-sm">
      <SkipLink />
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <BrandMark tone="onDark" />
          <span className="font-heading text-lg font-bold">{orgName}</span>
          {subtitle && <span className="hidden text-sm text-brand-mid sm:inline">· {subtitle}</span>}
        </div>
        {/* Keyboard focus ring must stay visible on the navy band. */}
        <SignOutButton className="border-transparent focus-visible:ring-white focus-visible:ring-offset-brand" />
      </div>
      {nav && nav.length > 0 && <NavTabs items={nav} />}
    </header>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 scroll-mt-4 focus:outline-none sm:px-6">
      {children}
    </main>
  );
}
