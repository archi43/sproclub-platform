// Réparation ponctuelle (2026-11-03) : remet à « non déposé » les livrables 360L
// que plus aucun dépôt réel ne confirme, hérités de l'ancienne règle du cours de
// rendu (questionnaire partagé, corrigée par la PR #49).
//
// Usage :
//   node --env-file=.env.local scripts/repair-unconfirmed-deposits.mts            (simulation)
//   node --env-file=.env.local scripts/repair-unconfirmed-deposits.mts --apply    (écriture)
//
// Le jeu exact des clés vient du dernier passage de la sync de production
// (stats.unconfirmedKeys dans sync_log). Sauvegarde paginée, comparée au count, AVANT toute
// écriture. Aucune donnée nominative n'est affichée (identifiants techniques seuls).

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const APPLY = process.argv.includes("--apply");
const PAGE = 1000;
const CHUNK = 100;
const MAX_LOG_AGE_MS = 2 * 60 * 60 * 1000;
const BACKUP = resolve(process.cwd(), "../sauvegardes/project-deliverables-non-confirmes-2026-11-03.json");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole || serviceRole.startsWith("placeholder")) {
  console.error("Supabase non configuré (.env.local).");
  process.exit(1);
}

const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
const slug = process.env.DEV_DEFAULT_ORG_SLUG ?? process.env.PLATFORM_DEFAULT_ORG_SLUG ?? "sproclub";
const { data: org, error: oe } = await admin.from("organizations").select("id").eq("slug", slug).single();
if (oe || !org) throw new Error(`org '${slug}' introuvable`);
const orgId = org.id as string;

// 1) Jeu exact des clés non confirmées, tel que la sync de production l'a calculé
//    (les credentials 360L ne vivent que sur Vercel). Passage récent et complet exigé.
const { data: log, error: le } = await admin
  .from("sync_log")
  .select("detail, ran_at")
  .eq("entity", "l360_projects")
  .eq("status", "ok")
  .order("ran_at", { ascending: false })
  .limit(1)
  .single();
if (le || !log) throw new Error(`sync_log : ${le?.message ?? "aucun passage"}`);
const stats = JSON.parse(log.detail as string) as { fetchErrors: number; unconfirmedDeposits: number; unconfirmedKeys?: string[] };
console.log("dernier passage :", log.ran_at, { unconfirmed: stats.unconfirmedDeposits, fetchErrors: stats.fetchErrors });
if (!stats.unconfirmedKeys) throw new Error("passage antérieur au déploiement qui expose unconfirmedKeys : relancer la sync");
if (Date.now() - new Date(log.ran_at as string).getTime() > MAX_LOG_AGE_MS) throw new Error("passage trop ancien : relancer la sync");
if (stats.fetchErrors > 0) throw new Error("appels 360L en échec sur ce passage : jeu incomplet, réparation abandonnée");
const keys = new Set(stats.unconfirmedKeys);

// 2) Lignes candidates, paginées et comparées au count.
type Row = Record<string, unknown> & { id: string; enrollment_id: string; project_number: number; validated_at: string | null };
const all: Row[] = [];
for (let from = 0; ; from += PAGE) {
  const { data, error } = await admin
    .from("project_deliverables")
    .select("*")
    .eq("org_id", orgId)
    .eq("source", "l360")
    .eq("deliverable_submitted", true)
    .order("id")
    .range(from, from + PAGE - 1);
  if (error) throw new Error(`lecture : ${error.message}`);
  all.push(...((data ?? []) as Row[]));
  if ((data ?? []).length < PAGE) break;
}
const { count, error: ce } = await admin
  .from("project_deliverables")
  .select("id", { count: "exact", head: true })
  .eq("org_id", orgId)
  .eq("source", "l360")
  .eq("deliverable_submitted", true);
if (ce) throw new Error(`count : ${ce.message}`);
if (count !== all.length) throw new Error(`lecture tronquée : ${all.length} lues pour ${count}`);

const targets = all.filter((r) => !r.validated_at && keys.has(`${r.enrollment_id}:${r.project_number}`));
console.log(`lignes l360 déposées : ${all.length} · non confirmées : ${targets.length} (clés de la sync : ${keys.size})`);

// 3) Conflits : soutenances actives sur un projet qu'on s'apprête à dé-déposer.
const conflicts: { enrollment_id: string; project_number: number; status: string; starts_at: string }[] = [];
const enrollmentIds = [...new Set(targets.map((t) => t.enrollment_id))];
for (let i = 0; i < enrollmentIds.length; i += CHUNK) {
  const { data, error } = await admin
    .from("reservations")
    .select("enrollment_id, project_number, status, starts_at")
    .eq("org_id", orgId)
    .eq("kind", "defense")
    .in("enrollment_id", enrollmentIds.slice(i, i + CHUNK));
  if (error) throw new Error(`réservations : ${error.message}`);
  for (const r of data ?? []) {
    if (keys.has(`${r.enrollment_id}:${r.project_number}`)) conflicts.push(r as (typeof conflicts)[number]);
  }
}
const byStatus = conflicts.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});
console.log(`soutenances sur ces projets : ${conflicts.length}`, byStatus);

if (!APPLY) {
  console.log("Simulation : rien n'a été écrit. Relancer avec --apply.");
  process.exit(0);
}

// 4) Sauvegarde, puis écriture ciblée par id (jamais une ligne validée).
mkdirSync(dirname(BACKUP), { recursive: true });
writeFileSync(BACKUP, JSON.stringify({ takenAt: new Date().toISOString(), orgId, rows: targets }, null, 2));
console.log(`sauvegarde : ${targets.length} lignes → ${BACKUP}`);

let updated = 0;
for (let i = 0; i < targets.length; i += CHUNK) {
  const ids = targets.slice(i, i + CHUNK).map((t) => t.id);
  const { data, error } = await admin
    .from("project_deliverables")
    .update({ deliverable_submitted: false, submitted_at: null })
    .in("id", ids)
    .eq("source", "l360")
    .is("validated_at", null)
    .select("id");
  if (error) throw new Error(`mise à jour : ${error.message} (${updated} déjà écrites, sauvegarde intacte)`);
  updated += (data ?? []).length;
}
console.log(`lignes remises à « non déposé » : ${updated}`);
