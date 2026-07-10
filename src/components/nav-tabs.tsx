"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { resolveActiveHref } from "@/lib/nav-active";
import type { NavItem } from "@/components/app-shell";

/**
 * Role navigation tabs. Highlights the current section (most-specific matching
 * href wins, so a nested route keeps its parent tab active) and exposes it to
 * assistive tech via `aria-current="page"`. Horizontally scrollable on narrow
 * screens; each tab is a ≥44px touch target.
 */
export function NavTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const activeHref = resolveActiveHref(pathname, items.map((n) => n.href));

  return (
    <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 sm:px-4" aria-label="Navigation principale">
      {items.map((n) => {
        const active = n.href === activeHref;
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-[44px] min-w-[44px] items-center justify-center whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium no-underline",
              active
                ? "border-b-2 border-brand text-brand"
                : "border-b-2 border-transparent text-grey-600 hover:bg-brand-tint hover:text-brand"
            )}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
