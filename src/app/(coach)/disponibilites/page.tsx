import { AvailabilityScreen } from "@/components/availability/screen";

/** Portail coach — « Mes disponibilités » (INC-19). Le coach publie lui-même
 *  ses créneaux ; RLS `0027` le borne à ses propres lignes. */
export default async function CoachAvailabilityPage() {
  return <AvailabilityScreen basePath="/disponibilites" audience="coach" />;
}
