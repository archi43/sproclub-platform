export type AppRole = "direction" | "coordinator" | "coach" | "evaluator" | "student" | "partner";

export interface Organization {
  id: string;
  slug: string;
  name: string;
  custom_domain: string | null;
  brand: Record<string, unknown>;
}

export interface Membership {
  org_id: string;
  profile_id: string;
  role: AppRole;
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

export interface ProjectDeliverable {
  id: string;
  org_id: string;
  enrollment_id: string;
  project_number: number;
  deliverable_submitted: boolean;
  deliverable_url: string | null;
  submitted_at: string | null;
  source: "platform" | "l360";
  validated_at: string | null; // validation par le jury (parcours 360L "successful")
  l360_score: number | null;
}

export type BookingKind = "coaching" | "defense";
export type BookingStatus = "pending" | "confirmed" | "declined" | "cancelled";

export interface Availability {
  id: string;
  org_id: string;
  host_id: string;
  kind: BookingKind;
  starts_at: string;
  ends_at: string;
  calcom_ref: string | null;
}

export interface Reservation {
  id: string;
  org_id: string;
  learner_id: string;
  enrollment_id: string;
  kind: BookingKind;
  project_number: number | null;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  calcom_booking_id: string | null;
  created_at: string;
}
