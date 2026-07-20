// Sonde de recette — liste les comptes staff provisionnés (email + rôle + org),
// pour choisir vers quel compte générer un lien de connexion.
// Usage: node --env-file=.env.local scripts/list-staff.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole || serviceRole.startsWith("placeholder")) {
  console.error("Missing/placeholder Supabase env. Point .env.local at the project first.");
  process.exit(1);
}

const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const STAFF_ROLES = ["direction", "coordinator", "coach"];

const { data, error } = await admin
  .from("memberships")
  .select("role, deactivated_at, org:organizations(name), profile:profiles!memberships_profile_id_fkey(email)")
  .in("role", STAFF_ROLES)
  .order("role", { ascending: true });

if (error) {
  console.error("Error:", error.message);
  process.exit(1);
}

if (!data?.length) {
  console.log("Aucun membership staff trouvé.");
  process.exit(0);
}

console.log(`\n${data.length} compte(s) staff :\n`);
for (const m of data) {
  const active = m.deactivated_at ? "DÉSACTIVÉ" : "actif";
  console.log(`  ${m.role.padEnd(12)} ${(m.profile?.email ?? "?").padEnd(38)} [${active}]  org=${m.org?.name ?? "?"}`);
}
console.log("");
