import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Program catalogue (Module 4 / S4.1). RLS: staff read; direction/coordinator
 *  manage. The publication rule is enforced by a DB trigger (0010). */
export interface Program {
  id: string;
  org_id: string;
  name: string;
  specialty: string | null;
  family: string | null;
  rncp: string | null;
  cpf_eligible: boolean;
  published: boolean;
  path_360l: string | null;
  syllabus_url: string | null;
  eval_modalities: string | null;
  created_at: string;
}

const COLS =
  "id, org_id, name, specialty, family, rncp, cpf_eligible, published, path_360l, syllabus_url, eval_modalities, created_at";

export async function listPrograms(orgId: string): Promise<Program[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("programs")
    .select(COLS)
    .eq("org_id", orgId)
    .order("name", { ascending: true });
  if (error) throw new Error(`Failed to load programs: ${error.message}`);
  return (data ?? []) as Program[];
}

export interface NewProgram {
  name: string;
  specialty?: string;
  family?: string;
  rncp?: string;
  cpfEligible?: boolean;
  path360l?: string;
  syllabusUrl?: string;
  evalModalities?: string;
}

/** A program rule violation (e.g. publish gate) surfaced from the DB. */
export class ProgramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProgramError";
  }
}

export async function createProgram(orgId: string, input: NewProgram): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("programs").insert({
    org_id: orgId,
    name: input.name,
    specialty: input.specialty || null,
    family: input.family || null,
    rncp: input.rncp || null,
    cpf_eligible: input.cpfEligible ?? false,
    path_360l: input.path360l || null,
    syllabus_url: input.syllabusUrl || null,
    eval_modalities: input.evalModalities || null,
  });
  if (error) throw new ProgramError(error.message);
}

/** Publish / unpublish. The DB trigger blocks publishing an incomplete program. */
export async function setProgramPublished(orgId: string, id: string, published: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("programs")
    .update({ published })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw new ProgramError(error.message);
}
