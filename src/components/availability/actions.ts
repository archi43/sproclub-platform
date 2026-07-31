"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { requireUser } from "@/lib/auth";
import {
  addRule,
  deleteRule,
  setRuleActive,
  addBlock,
  deleteBlock,
  saveFeed,
  deleteFeed,
  publishMySlots,
} from "@/lib/data/availability";
import type { BookingKind } from "@/lib/availability-rules";

/**
 * Actions « Mes disponibilités » (INC-19), partagées par le portail coach et le
 * portail jury. Le titulaire est toujours l'appelant : `host_id` vient de la
 * session, jamais du formulaire — la RLS (`0027`) refuserait de toute façon
 * une ligne portant l'identité de quelqu'un d'autre.
 *
 * Chaque écriture republie les créneaux : une plage ajoutée doit devenir
 * réservable tout de suite, sans attendre le passage du cron.
 */

export type ActionState = { ok: boolean; message: string };

const KINDS: BookingKind[] = ["coaching", "defense"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

async function context() {
  const org = await getOrgContext();
  if (!org) throw new Error("Organisme introuvable.");
  const user = await requireUser();
  return { orgId: org.id, hostId: user.id, email: user.email ?? "" };
}

async function republish(basePath: string) {
  const { orgId, hostId, email } = await context();
  await publishMySlots(orgId, hostId, email);
  revalidatePath(basePath);
}

export async function addRuleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const basePath = String(formData.get("basePath") ?? "/");
  const kind = String(formData.get("kind") ?? "");
  const weekday = Number(formData.get("weekday"));
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const slotMinutes = Number(formData.get("slotMinutes"));

  if (!KINDS.includes(kind as BookingKind)) return { ok: false, message: "Type de rendez-vous invalide." };
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { ok: false, message: "Jour invalide." };
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return { ok: false, message: "Horaire invalide." };
  if (endTime <= startTime) return { ok: false, message: "L'heure de fin doit suivre l'heure de début." };
  if (!Number.isInteger(slotMinutes) || slotMinutes < 15 || slotMinutes > 480) {
    return { ok: false, message: "Durée de créneau invalide." };
  }

  try {
    const { orgId, hostId } = await context();
    await addRule(orgId, hostId, {
      kind: kind as BookingKind,
      weekday,
      startTime,
      endTime,
      slotMinutes,
    });
    await republish(basePath);
  } catch {
    return { ok: false, message: "L'ajout a échoué. Réessayez." };
  }
  return { ok: true, message: "Plage ajoutée et créneaux publiés." };
}

export async function deleteRuleAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const basePath = String(formData.get("basePath") ?? "/");
  if (!id) return;
  const { orgId } = await context();
  await deleteRule(orgId, id);
  await republish(basePath);
}

export async function toggleRuleAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const basePath = String(formData.get("basePath") ?? "/");
  const active = String(formData.get("active") ?? "") === "1";
  if (!id) return;
  const { orgId } = await context();
  await setRuleActive(orgId, id, active);
  await republish(basePath);
}

export async function addBlockAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const basePath = String(formData.get("basePath") ?? "/");
  const effect = String(formData.get("effect") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const kindRaw = String(formData.get("kind") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (effect !== "open" && effect !== "closed") return { ok: false, message: "Type d'exception invalide." };
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { ok: false, message: "Dates invalides." };
  if (end <= start) return { ok: false, message: "La fin doit suivre le début." };

  try {
    const { orgId, hostId } = await context();
    await addBlock(orgId, hostId, {
      kind: KINDS.includes(kindRaw as BookingKind) ? (kindRaw as BookingKind) : null,
      effect,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
      slotMinutes: 60,
      reason,
    });
    await republish(basePath);
  } catch {
    return { ok: false, message: "L'ajout a échoué. Réessayez." };
  }
  return {
    ok: true,
    message: effect === "closed" ? "Indisponibilité enregistrée." : "Créneau exceptionnel ouvert.",
  };
}

export async function deleteBlockAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const basePath = String(formData.get("basePath") ?? "/");
  if (!id) return;
  const { orgId } = await context();
  await deleteBlock(orgId, id);
  await republish(basePath);
}

export async function saveFeedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const basePath = String(formData.get("basePath") ?? "/");
  const icsUrl = String(formData.get("icsUrl") ?? "").trim();
  if (!icsUrl) return { ok: false, message: "Collez le lien privé de votre agenda." };

  try {
    const { orgId, hostId } = await context();
    await saveFeed(orgId, hostId, icsUrl);
    revalidatePath(basePath);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Enregistrement impossible." };
  }
  return {
    ok: true,
    message: "Agenda enregistré. La prochaine synchronisation masquera vos créneaux occupés.",
  };
}

export async function deleteFeedAction(formData: FormData): Promise<void> {
  const basePath = String(formData.get("basePath") ?? "/");
  const { orgId, hostId } = await context();
  await deleteFeed(orgId, hostId);
  revalidatePath(basePath);
}

export async function publishAction(formData: FormData): Promise<void> {
  const basePath = String(formData.get("basePath") ?? "/");
  await republish(basePath);
}
