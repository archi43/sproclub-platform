"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { resolveActiveHref } from "@/lib/nav-active";
import type { NavItem } from "@/components/app-shell";

/**
 * Role navigation tabs on the navy header band (charte: active tab carries the
 * red accent underline). Highlights the current section (most-specific matching
 * href wins, so a nested route keeps its parent tab active) and exposes it to
 * assistive tech via `aria-current="page"`. Horizontally scrollable on narrow
 * screens; each tab is a ≥44px touch target.
 */
export function NavTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const activeHref = resolveActiveHref(pathname, items.map((n) => n.href));

  return (
    <nav
      className="mx-auto flex max-w-6xl gap-1 overflow-x-auto border-t border-white/10 px-2 sm:px-4"
      aria-label="Navigation principale"
    >
      {items.map((n) => {
        const active = n.href === activeHref;
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-[44px] min-w-[44px] items-center justify-center whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium no-underline",
              "focus-visible:ring-white focus-visible:ring-offset-brand",
              active
                ? "border-b-2 border-accent bg-white/10 text-white"
                : "border-b-2 border-transparent text-white/75 hover:bg-white/10 hover:text-white"
            )}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
