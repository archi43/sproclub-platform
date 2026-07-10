"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { getCurrentUser, getRolesForOrg } from "@/lib/auth";
import { generateDocument, DocumentError } from "@/lib/data/documents-admin";
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/documents/content";

export type DocState = { ok: boolean; message: string };

/**
 * Generate a Qualiopi document for a dossier. The generation writes to the
 * private Storage bucket with the service role, so this action re-checks
 * authorization (direction/coordinator) — the layout guard does not protect a
 * direct Server Action call.
 */
export async function generateDocumentAction(_prev: DocState, formData: FormData): Promise<DocState> {
  const org = await getOrgContext();
  if (!org) return { ok: false, message: "Organisme introuvable." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Session expirée, reconnectez-vous." };
  const roles = await getRolesForOrg(org.id);
  if (!roles.includes("direction") && !roles.includes("coordinator")) {
    return { ok: false, message: "Accès refusé." };
  }

  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const kind = String(formData.get("kind") ?? "") as DocumentKind;
  const learnerId = String(formData.get("learnerId") ?? "");
  if (!enrollmentId) return { ok: false, message: "Dossier introuvable." };
  if (!DOCUMENT_KINDS.includes(kind)) return { ok: false, message: "Type de document invalide." };

  try {
    await generateDocument(org.id, org.name, enrollmentId, kind, user.id);
  } catch (err) {
    return { ok: false, message: err instanceof DocumentError ? `Génération impossible : ${err.message}` : "Erreur inattendue." };
  }
  if (learnerId) revalidatePath(`/coordination/apprenants/${learnerId}`);
  return { ok: true, message: "Document généré et archivé." };
}
