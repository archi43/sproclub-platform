"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { createProgram, setProgramPublished, ProgramError } from "@/lib/data/programs";

export type ProgramState = { ok: boolean; message: string };

/** Create a program (Module 4). Direction/coordinator only (RLS-enforced). */
export async function createProgramAction(_prev: ProgramState, formData: FormData): Promise<ProgramState> {
  const org = await getOrgContext();
  if (!org) return { ok: false, message: "Organisme introuvable." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, message: "Le nom du programme est requis." };

  try {
    await createProgram(org.id, {
      name,
      specialty: String(formData.get("specialty") ?? "").trim() || undefined,
      family: String(formData.get("family") ?? "").trim() || undefined,
      rncp: String(formData.get("rncp") ?? "").trim() || undefined,
      cpfEligible: formData.get("cpfEligible") === "on",
      path360l: String(formData.get("path360l") ?? "").trim() || undefined,
      syllabusUrl: String(formData.get("syllabusUrl") ?? "").trim() || undefined,
      evalModalities: String(formData.get("evalModalities") ?? "").trim() || undefined,
    });
  } catch (err) {
    return { ok: false, message: err instanceof ProgramError ? "Création impossible." : "Erreur inattendue." };
  }
  revalidatePath("/coordination/programmes");
  return { ok: true, message: "Programme créé." };
}

/** Publish / unpublish. The DB trigger blocks publishing an incomplete program. */
export async function togglePublishAction(_prev: ProgramState, formData: FormData): Promise<ProgramState> {
  const org = await getOrgContext();
  if (!org) return { ok: false, message: "Organisme introuvable." };
  const id = String(formData.get("id") ?? "");
  const publish = formData.get("publish") === "true";
  if (!id) return { ok: false, message: "Programme introuvable." };

  try {
    await setProgramPublished(org.id, id, publish);
  } catch (err) {
    // The publish-gate trigger message is explicit and in French.
    return { ok: false, message: err instanceof ProgramError ? err.message : "Action impossible." };
  }
  revalidatePath("/coordination/programmes");
  return { ok: true, message: publish ? "Programme publié." : "Programme dépublié." };
}
