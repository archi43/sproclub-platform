import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { listDossiers, dossierFilterOptions, type DossierFilters } from "@/lib/data/admin-learners";

/** Module 2 / S2.1 — filterable list of dossiers (direction/coordinator; a coach
 *  sees only their own via RLS). One row = one dossier. */
export default async function ApprenantsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const org = await getOrgContext();
  if (!org) return <main style={{ padding: 32 }}><p>Organisme introuvable.</p></main>;

  const pick = (k: string) => {
    const v = searchParams[k];
    return (Array.isArray(v) ? v[0] : v) || undefined;
  };
  const filters: DossierFilters = {
    program: pick("program"),
    status: pick("status"),
    financer: pick("financer"),
    late: pick("late") === "1",
  };

  const [rows, options] = await Promise.all([listDossiers(org.id, filters), dossierFilterOptions(org.id)]);

  const sel = { padding: 6, fontSize: 14 } as const;
  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>Apprenants</h1>

      <form method="get" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", margin: "12px 0 20px" }}>
        <select name="program" defaultValue={filters.program ?? ""} style={sel}>
          <option value="">Tous les programmes</option>
          {options.programs.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select name="status" defaultValue={filters.status ?? ""} style={sel}>
          <option value="">Tous les statuts</option>
          {options.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select name="financer" defaultValue={filters.financer ?? ""} style={sel}>
          <option value="">Tous les financeurs</option>
          {options.financers.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
          <input type="checkbox" name="late" value="1" defaultChecked={filters.late} /> En retard
        </label>
        <button type="submit" style={{ padding: "6px 12px" }}>Filtrer</button>
        <Link href="/coordination/apprenants" style={{ fontSize: 13 }}>Réinitialiser</Link>
      </form>

      <p style={{ color: "#555", fontSize: 14 }}>{rows.length} dossier(s)</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #e5e5e5" }}>
              <th style={{ padding: 8 }}>Apprenant</th>
              <th style={{ padding: 8 }}>Programme</th>
              <th style={{ padding: 8 }}>Financeur</th>
              <th style={{ padding: 8 }}>Statut</th>
              <th style={{ padding: 8 }}>Avancement</th>
              <th style={{ padding: 8 }}>Retard</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.enrollmentId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: 8 }}>
                  <Link href={`/coordination/apprenants/${r.learnerId}`}>
                    {[r.firstName, r.lastName].filter(Boolean).join(" ") || r.email}
                  </Link>
                </td>
                <td style={{ padding: 8 }}>{r.program ?? "—"}</td>
                <td style={{ padding: 8 }}>{r.financer ?? "—"}</td>
                <td style={{ padding: 8 }}>{r.status ?? "—"}</td>
                <td style={{ padding: 8 }}>{r.progress != null ? `${Math.round(r.progress * 100)}%` : "—"}</td>
                <td style={{ padding: 8, color: (r.lateDays ?? 0) > 0 ? "#b00020" : undefined }}>
                  {r.lateDays != null ? `${r.lateDays} j` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
