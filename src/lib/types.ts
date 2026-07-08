export type AppRole = "direction" | "coordinator" | "coach" | "evaluator" | "student";

export interface Organization {
  id: string;
  slug: string;
  name: string;
  custom_domain: string | null;
  brand: Record<string, unknown>;
}

export interface Enrollment {
  id: string;
  org_id: string;
  program: string | null;
  specialty: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
}
