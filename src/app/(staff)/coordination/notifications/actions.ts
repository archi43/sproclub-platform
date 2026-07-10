"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { getCurrentUser, getRolesForOrg } from "@/lib/auth";
import { addOptOut, removeOptOut } from "@/lib/data/notifications";

export type PrefState = { ok: boolean; message: string };

async function guard(): Promise<{ orgId: string } | { error: string }> {
  const org = await getOrgContext();
  if (!org) return { error: "Organisme introuvable." };
  const user = await getCurrentUser();
  if (!user) return { error: "Session expirée, reconnectez-vous." };
  const roles = await getRolesForOrg(org.id);
  if (!roles.includes("direction") && !roles.includes("coordinator")) {
    return { error: "Accès refusé." };
  }
  return { orgId: org.id };
}

/** Add an opt-out (direction/coordinator). RLS enforces the org + role. */
export async function addOptOutAction(_prev: PrefState, formData: FormData): Promise<PrefState> {
  const g = await guard();
  if ("error" in g) return { ok: false, message: g.error };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const kind = String(formData.get("kind") ?? "").trim();
  if (!email || !email.includes("@")) return { ok: false, message: "Adresse e-mail invalide." };
  if (!kind) return { ok: false, message: "Choisissez un type de relance." };

  try {
    await addOptOut(g.orgId, email, kind);
  } catch {
    return { ok: false, message: "Enregistrement impossible." };
  }
  revalidatePath("/coordination/notifications");
  return { ok: true, message: "Préférence enregistrée (relance désactivée)." };
}

/** Remove an opt-out row. */
export async function removeOptOutAction(formData: FormData): Promise<void> {
  const g = await guard();
  if ("error" in g) return;
  const id = String(formData.get("id") ?? "");
  if (id) {
    try {
      await removeOptOut(g.orgId, id);
    } catch {
      // Best-effort; the page re-renders with the current state.
    }
  }
  revalidatePath("/coordination/notifications");
}
