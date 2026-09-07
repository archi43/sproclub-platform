// NB: pas de "server-only" ici — importé par les tests Node. Ne jamais importer depuis un composant client.
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Plateforme → Airtable : write-back des soutenances (INC-26).
 *
 * Pourquoi ce module existe. La table « Soutenances formation » est un miroir
 * de Google Agenda (Title, Start, End, Attendees, Event ID…), historiquement
 * alimentée par Make ; un second scénario horaire tentait ensuite de deviner la
 * commande et le formateur à partir de l'événement. La plateforme, elle, part
 * de la réservation : elle **connaît déjà** le dossier, le projet et les
 * évaluateurs. Elle écrit donc la ligne avec ses liens résolus, sans étape de
 * réconciliation.
 *
 * Modèle de sûreté, identique au write-back des comptes rendus :
 *   - CREATE seulement — jamais de PATCH ni de DELETE sur un record existant ;
 *   - idempotent — `airtable_synced` + `airtable_record_id` (unique en base) ;
 *   - sous condition d'`AIRTABLE_WRITEBACK_ENABLED` ET d'un token en écriture,
 *     donc dégradation propre tant que le credential n'est pas relevé ;
 *   - seules les soutenances **nées dans la plateforme** partent : celles qui
 *     viennent déjà de l'agenda continueraient d'arriver par l'ancien chemin,
 *     et les pousser créerait le doublon qu'on cherche justement à éviter.
 */

export interface DefenseWritebackStats {
  enabled: boolean;
  pending: number;
  pushed: number;
  /** Dossier sans record Airtable d'origine : rien à rattacher. */
  skippedNoCommande: number;
  /** Évaluateur introuvable dans « Team SproCLUB » : poussé sans jury. */
  unmatchedEvaluators: number;
}

export interface DefenseRow {
  id: string;
  enrollment_id: string;
  project_number: number | null;
  starts_at: string;
  ends_at: string;
  status: string;
  calcom_booking_id: string | null;
}

export interface DefenseContext {
  commandeRecordId: string;
  learnerName: string;
  learnerEmail: string;
  /** Record ids Airtable des évaluateurs, résolus par e-mail. Peut être vide. */
  teamRecordIds: string[];
}

/** Statut Airtable attendu par la table miroir (vocabulaire Google Agenda). */
const STATUS_MAP: Record<string, string> = {
  pending: "tentative",
  confirmed: "confirmed",
  cancelled: "cancelled",
  declined: "cancelled",
};

/**
 * Champs Airtable d'une soutenance (builder **pur**, testé unitairement).
 *
 * `Event ID` porte l'identifiant Cal.eu quand il existe, sinon l'identifiant de
 * la réservation préfixé : la colonne reste la clé de rapprochement de la table,
 * et le préfixe rend visible ce qui vient de la plateforme.
 */
export function buildSoutenanceFields(r: DefenseRow, ctx: DefenseContext): Record<string, unknown> {
  const projet = r.project_number != null ? ` — projet ${r.project_number}` : "";
  return {
    Title: `Soutenance${projet} · ${ctx.learnerName}`,
    Start: r.starts_at,
    End: r.ends_at,
    Status: STATUS_MAP[r.status] ?? "tentative",
    Description:
      `Soutenance planifiée depuis la plateforme SproCLUB.` +
      (r.project_number != null ? `\nProjet ${r.project_number}.` : "") +
      `\nApprenant : ${ctx.learnerName}.`,
    Attendees: ctx.learnerEmail,
    "Event ID": r.calcom_booking_id ?? `sproclub:${r.id}`,
    "Sales Orders-header": [ctx.commandeRecordId],
    ...(ctx.teamRecordIds.length > 0 ? { "[Master data]Team SproCLUB": ctx.teamRecordIds } : {}),
  };
}

const AIRTABLE_REC_RE = /^rec[A-Za-z0-9]{14}$/;
const BATCH = 10;
// Identifiants relevés sur la base réelle (API meta), pas devinés.
const SOUTENANCES_TABLE = "tblWV8UbwgJ5NgnuW"; // « Soutenances formation »
const TEAM_TABLE = "tblGrZE3oHM6gEn4F"; // « [Master data]Team SproCLUB »

/**
 * Soutenances en attente de write-back : **uniquement celles de la plateforme**.
 *
 * Une réservation annulée n'est jamais poussée : créer une ligne pour un
 * événement qui n'aura pas lieu polluerait le miroir. La propagation d'une
 * annulation vers une ligne déjà poussée est un autre sujet, volontairement
 * laissé de côté tant que le modèle est en création seule.
 */
export async function listPendingDefenses(admin: SupabaseClient, orgId: string): Promise<DefenseRow[]> {
  const { data, error } = await admin
    .from("reservations")
    .select("id, enrollment_id, project_number, starts_at, ends_at, status, calcom_booking_id")
    .eq("org_id", orgId)
    .eq("kind", "defense")
    .eq("airtable_synced", false)
    .in("status", ["pending", "confirmed"])
    .limit(200);
  if (error) throw new Error(`writeback defenses: ${error.message}`);
  return (data ?? []) as DefenseRow[];
}

/** Annuaire e-mail → record id de « Team SproCLUB », pour rattacher le jury. */
export async function fetchTeamByEmail(apiKey: string, baseId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let offset: string | undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${TEAM_TABLE}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`Airtable team fetch failed: ${res.status}`);
    const page = (await res.json()) as { records: { id: string; fields: Record<string, unknown> }[]; offset?: string };
    for (const rec of page.records) {
      const mail = rec.fields["Mail"];
      if (typeof mail === "string" && mail.trim()) out.set(mail.trim().toLowerCase(), rec.id);
    }
    offset = page.offset;
  } while (offset);
  return out;
}

export async function pushDefenses(admin: SupabaseClient, orgId: string): Promise<DefenseWritebackStats> {
  const stats: DefenseWritebackStats = {
    enabled: false, pending: 0, pushed: 0, skippedNoCommande: 0, unmatchedEvaluators: 0,
  };
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableId = process.env.AIRTABLE_SOUTENANCES_TABLE_ID ?? SOUTENANCES_TABLE;
  if (process.env.AIRTABLE_WRITEBACK_ENABLED !== "true" || !apiKey || !baseId) return stats;
  stats.enabled = true;

  const pending = await listPendingDefenses(admin, orgId);
  stats.pending = pending.length;
  if (pending.length === 0) return stats;

  // Dossier → record Airtable d'origine + identité de l'apprenant.
  const enrollmentIds = [...new Set(pending.map((r) => r.enrollment_id))];
  const { data: enrollments, error: ee } = await admin
    .from("enrollments_ro")
    .select("id, airtable_record_id, learner:learners_ro(first_name, last_name, email)")
    .eq("org_id", orgId)
    .in("id", enrollmentIds);
  if (ee) throw new Error(`writeback enrollments: ${ee.message}`);
  type EnrRow = { id: string; airtable_record_id: string; learner: { first_name: string | null; last_name: string | null; email: string } | null };
  const enrById = new Map(((enrollments ?? []) as unknown as EnrRow[]).map((e) => [e.id, e]));

  // Jury de chaque soutenance, par e-mail d'évaluateur.
  const { data: evals, error: eve } = await admin
    .from("reservation_evaluators")
    .select("reservation_id, evaluator:profiles!reservation_evaluators_evaluator_id_fkey(email)")
    .eq("org_id", orgId)
    .in("reservation_id", pending.map((r) => r.id));
  if (eve) throw new Error(`writeback evaluators: ${eve.message}`);
  const emailsByReservation = new Map<string, string[]>();
  for (const row of (evals ?? []) as unknown as { reservation_id: string; evaluator: { email: string } | null }[]) {
    const mail = row.evaluator?.email?.toLowerCase();
    if (!mail) continue;
    emailsByReservation.set(row.reservation_id, [...(emailsByReservation.get(row.reservation_id) ?? []), mail]);
  }
  const teamByEmail = await fetchTeamByEmail(apiKey, baseId);

  const items: { reservationId: string; fields: Record<string, unknown> }[] = [];
  for (const r of pending) {
    const enr = enrById.get(r.enrollment_id);
    if (!enr || !AIRTABLE_REC_RE.test(enr.airtable_record_id)) {
      stats.skippedNoCommande++;
      continue;
    }
    const emails = emailsByReservation.get(r.id) ?? [];
    const teamRecordIds = emails.map((e) => teamByEmail.get(e)).filter((v): v is string => !!v);
    stats.unmatchedEvaluators += emails.length - teamRecordIds.length;

    const learnerName =
      [enr.learner?.first_name, enr.learner?.last_name].filter(Boolean).join(" ") || enr.learner?.email || "—";
    items.push({
      reservationId: r.id,
      fields: buildSoutenanceFields(r, {
        commandeRecordId: enr.airtable_record_id,
        learnerName,
        learnerEmail: enr.learner?.email ?? "",
        teamRecordIds,
      }),
    });
  }

  for (let i = 0; i < items.length; i += BATCH) {
    const group = items.slice(i, i + BATCH);
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: group.map((g) => ({ fields: g.fields })), typecast: true }),
    });
    if (!res.ok) throw new Error(`Airtable defense writeback failed: ${res.status} ${await res.text()}`);
    const created = (await res.json()) as { records: { id: string }[] };
    for (let j = 0; j < group.length; j++) {
      const { error } = await admin
        .from("reservations")
        .update({ airtable_synced: true, airtable_record_id: created.records[j]?.id ?? null })
        .eq("id", group[j].reservationId);
      if (error) throw new Error(`writeback mark synced: ${error.message}`);
      stats.pushed++;
    }
  }

  await admin.from("sync_log").insert({
    entity: "soutenances",
    direction: "pg_to_airtable",
    status: "ok",
    detail: JSON.stringify(stats),
  });
  return stats;
}
