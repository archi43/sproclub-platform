// NB: règles pures (aucune I/O) — testées hors DB, utilisées par le portail
// partenaire et la fiche apprenant.

/**
 * Vivier de talents (INC-17) — calcul de la disponibilité d'un candidat.
 *
 * Priorité (décision produit) :
 *   1. statut posé par la coordination (`staff_status`) — fait foi ;
 *   2. déclaratif apprenant (`available_from`) ;
 *   3. repli sur la formation : terminée → disponible ; fin prévue → à venir ;
 *      sinon → en formation.
 */

export type StaffTalentStatus = "searching" | "employed" | "unavailable";

export interface AvailabilityInput {
  staffStatus: StaffTalentStatus | null;
  availableFrom: string | null; // YYYY-MM-DD, déclaratif apprenant
  endDate: string | null; // fin de formation prévue (sync Airtable)
  enrollmentStatus: string | null; // ex. « En cours », « Terminé »
  today: string; // YYYY-MM-DD (injecté : règle pure, testable)
}

export interface Availability {
  state: "available" | "soon" | "in_training" | "employed" | "unavailable";
  label: string;
  tone: "success" | "warning" | "neutral";
  availableFrom: string | null;
}

const FR_DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function formatDate(iso: string): string {
  return FR_DATE.format(new Date(`${iso}T00:00:00Z`));
}

export function computeAvailability(input: AvailabilityInput): Availability {
  if (input.staffStatus === "employed") {
    return { state: "employed", label: "En poste", tone: "neutral", availableFrom: null };
  }
  if (input.staffStatus === "unavailable") {
    return { state: "unavailable", label: "Indisponible", tone: "neutral", availableFrom: null };
  }
  if (input.staffStatus === "searching") {
    const from = input.availableFrom && input.availableFrom > input.today ? input.availableFrom : null;
    return from
      ? { state: "soon", label: `En recherche — dès le ${formatDate(from)}`, tone: "warning", availableFrom: from }
      : { state: "available", label: "En recherche active", tone: "success", availableFrom: input.today };
  }

  if (input.availableFrom) {
    return input.availableFrom > input.today
      ? { state: "soon", label: `Disponible le ${formatDate(input.availableFrom)}`, tone: "warning", availableFrom: input.availableFrom }
      : { state: "available", label: "Disponible", tone: "success", availableFrom: input.availableFrom };
  }

  if ((input.enrollmentStatus ?? "").toLowerCase().startsWith("terminé")) {
    return { state: "available", label: "Formation terminée", tone: "success", availableFrom: input.endDate };
  }
  if (input.endDate && input.endDate > input.today) {
    return { state: "soon", label: `Fin de formation le ${formatDate(input.endDate)}`, tone: "warning", availableFrom: input.endDate };
  }
  return { state: "in_training", label: "En formation", tone: "neutral", availableFrom: null };
}
