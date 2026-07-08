import type { ReactNode } from "react";
import { getOrgContext } from "@/lib/tenant";
import { requireOrgRole } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";

/**
 * Staff shell + route guard. Access requires direction or coordinator in the
 * organization resolved from the host. RLS remains the authoritative filter on
 * the data; this guard only governs navigation.
 */
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const org = await getOrgContext();
  if (!org) {
    return (
      <main style={{ padding: 32, fontFamily: "system-ui" }}>
        <p>Organisme introuvable pour ce domaine.</p>
      </main>
    );
  }

  await requireOrgRole(org.id, ["direction", "coordinator"]);

  return (
    <div style={{ fontFamily: "system-ui" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 32px",
          borderBottom: "1px solid #e5e5e5",
        }}
      >
        <strong>{org.name} · Coordination</strong>
        <SignOutButton />
      </header>
      {children}
    </div>
  );
}
