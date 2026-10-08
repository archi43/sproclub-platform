"use server";

import { getOrgContext } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/auth";
import { revealMyResourcePassword } from "@/lib/data/resources";
import { checkRateLimit, logOpsEvent } from "@/lib/data/ops";
import { RESOURCE_REVEAL_LIMIT } from "@/lib/ratelimit-rules";

export type RevealState =
  | { ok: true; password: string }
  | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Server action (INC-30) : l'apprenant affiche le mot de passe d'un de ses accès.
 *
 * Une action serveur est appelable par tout utilisateur connecté, quel que soit
 * l'écran : la garde n'est donc pas ici mais dans `reveal_resource_assignment`
 * (propriété, période, journalisation). Cette action ne fait que valider
 * l'entrée, plafonner le débit et traduire le résultat. Le mot de passe n'est
 * jamais journalisé, ni dans `ops_events` ni dans les logs serveur.
 */
export async function revealPasswordAction(assignmentId: string): Promise<RevealState> {
  if (!UUID.test(assignmentId)) return { ok: false, message: "Accès introuvable." };

  const org = await getOrgContext();
  const user = await getCurrentUser();
  if (!org || !user) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };

  if (!(await checkRateLimit(RESOURCE_REVEAL_LIMIT, user.id))) {
    return { ok: false, message: "Trop de demandes en peu de temps. Réessayez dans quelques minutes." };
  }

  try {
    const result = await revealMyResourcePassword(assignmentId);
    if (result.ok) return { ok: true, password: result.password };
    if (result.reason === "empty") {
      return { ok: false, message: "Aucun mot de passe n'est encore enregistré pour cet accès. Contactez la coordination." };
    }
    if (result.reason === "unavailable") {
      await logOpsEvent({
        orgId: org.id, level: "error", source: "portal.resources",
        message: "Lecture du mot de passe d'une ressource impossible (Airtable indisponible)",
      });
      return { ok: false, message: "Le mot de passe est momentanément indisponible. Réessayez plus tard." };
    }
    return { ok: false, message: "Ce mot de passe n'est pas disponible pour le moment." };
  } catch {
    return { ok: false, message: "Le mot de passe est momentanément indisponible. Réessayez plus tard." };
  }
}
