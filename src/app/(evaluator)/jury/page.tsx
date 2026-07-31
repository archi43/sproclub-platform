import { AvailabilityScreen } from "@/components/availability/screen";

/** Portail jury — « Mes disponibilités » (INC-19) : l'évaluateur publie ses
 *  créneaux de soutenance, que la coordination peut ensuite proposer. */
export default async function JuryAvailabilityPage() {
  return <AvailabilityScreen basePath="/jury" audience="jury" />;
}
