/**
 * Navigation active-tab rule — pure, tested off-DOM (same pattern as the other
 * *-rules modules). Given the current pathname and the nav hrefs, return the
 * single href that should be marked active: the MOST SPECIFIC one whose href is
 * the pathname or a path-segment prefix of it. This keeps a parent tab from
 * staying active when a more specific child tab exists, and never marks two.
 */
export function resolveActiveHref(pathname: string, hrefs: string[]): string | undefined {
  return hrefs
    .filter((h) => pathname === h || pathname.startsWith(`${h}/`))
    .sort((a, b) => b.length - a.length)[0];
}
