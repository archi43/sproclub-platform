import "server-only";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { buildDocument, documentFileName, DOCUMENT_LABELS, DOCUMENT_KINDS, type DocumentData, type DocumentKind } from "@/lib/documents/content";
import { renderDocumentPdf } from "@/lib/documents/pdf";

/**
 * Document generation & emission journal (INC-9), for staff.
 *
 * Reads the dossier through the RLS client (so a non-staff / cross-org caller
 * gets nothing), then generates the PDF and writes it — plus the emission row —
 * with the service role, because only it may write the private `learner-docs`
 * bucket (0015). Callers MUST be behind the direction/coordinator route guard.
 */

const BUCKET = "learner-docs";

export class DocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentError";
  }
}

export interface Emission {
  id: string;
  enrollmentId: string;
  kind: DocumentKind;
  kindLabel: string;
  storagePath: string;
  generatedAt: string;
  url: string | null;
}

type DossierRaw = {
  id: string;
  program: string | null;
  specialty: string | null;
  financer: string | null;
  start_date: string | null;
  end_date: string | null;
  learner: { first_name: string | null; last_name: string | null; email: string } | null;
};

/** Generate a document for a dossier, archive it in Storage, and log the
 *  emission. Returns the storage path. `orgName` comes from the resolved org.
 *
 *  NOT a role check by itself: it writes with the service role (bypasses RLS),
 *  so it MUST be called behind a direction/coordinator route guard. It does
 *  read the dossier via RLS, so an out-of-scope enrollment yields nothing. */
export async function generateDocument(
  orgId: string,
  orgName: string,
  enrollmentId: string,
  kind: DocumentKind,
  actorId: string,
  defenseDate?: string | null
): Promise<string> {
  if (!DOCUMENT_KINDS.includes(kind)) throw new DocumentError("Type de document invalide.");

  // 1) Read the dossier via RLS — nothing to generate if the caller can't see it.
  const supabase = createClient();
  const { data, error } = await supabase
    .from("enrollments_ro")
    .select("id, program, specialty, financer, start_date, end_date, learner:learners_ro(first_name, last_name, email)")
    .eq("org_id", orgId)
    .eq("id", enrollmentId)
    .maybeSingle();
  if (error) throw new DocumentError(error.message);
  const row = data as unknown as DossierRaw | null;
  if (!row || !row.learner?.email) throw new DocumentError("Dossier introuvable ou sans e-mail.");

  const email = row.learner.email.toLowerCase();
  const issuedOn = new Date().toISOString().slice(0, 10);

  // A convocation needs the real defense date/time — resolve it from the
  // dossier's defense reservation when the caller did not supply one, so the
  // document is never issued with a blank date.
  let resolvedDefenseDate = defenseDate ?? null;
  if (kind === "convocation_soutenance" && !resolvedDefenseDate) {
    const { data: def } = await supabase
      .from("reservations")
      .select("starts_at")
      .eq("org_id", orgId)
      .eq("enrollment_id", enrollmentId)
      .eq("kind", "defense")
      .in("status", ["pending", "confirmed"])
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (def?.starts_at) {
      resolvedDefenseDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(
        new Date(def.starts_at as string)
      );
    }
  }

  const docData: DocumentData = {
    organizationName: orgName,
    learnerName: [row.learner.first_name, row.learner.last_name].filter(Boolean).join(" ") || email,
    learnerEmail: email,
    program: row.program,
    specialty: row.specialty,
    financer: row.financer,
    startDate: row.start_date,
    endDate: row.end_date,
    issuedOn,
    defenseDate: resolvedDefenseDate,
  };

  // 2) Render the PDF (pure content → bytes).
  const pdf = await renderDocumentPdf(buildDocument(kind, docData));

  // 3) Archive + journal with the service role (only it may write the bucket).
  const admin = adminClient();
  const path = `${orgId}/${email}/${documentFileName(kind, issuedOn)}`;
  const up = await admin.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new DocumentError(up.error.message);

  const { error: logErr } = await admin.from("document_emissions").insert({
    org_id: orgId,
    enrollment_id: enrollmentId,
    learner_email: email,
    kind,
    storage_path: path,
    generated_by: actorId,
  });
  if (logErr) throw new DocumentError(logErr.message);

  return path;
}

/** The emission journal for a dossier (staff read via RLS). */
export async function listEmissions(orgId: string, enrollmentId: string): Promise<Emission[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("document_emissions")
    .select("id, enrollment_id, kind, storage_path, generated_at")
    .eq("org_id", orgId)
    .eq("enrollment_id", enrollmentId)
    .order("generated_at", { ascending: false });
  if (error) throw new Error(`Failed to load emissions: ${error.message}`);

  const rows = (data ?? []) as Record<string, unknown>[];
  const out: Emission[] = [];
  for (const r of rows) {
    const storagePath = r.storage_path as string;
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 300);
    out.push({
      id: r.id as string,
      enrollmentId: r.enrollment_id as string,
      kind: r.kind as DocumentKind,
      kindLabel: DOCUMENT_LABELS[r.kind as DocumentKind] ?? (r.kind as string),
      storagePath,
      generatedAt: r.generated_at as string,
      url: signed?.signedUrl ?? null,
    });
  }
  return out;
}
