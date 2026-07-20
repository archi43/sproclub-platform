// Dev/recette helper — mint a one-time login link for an existing account
// WITHOUT sending an e-mail (so it is not subject to the 2 mails/hour cap).
//
// It builds a link to the app's own /auth/callback using the token-hash flow
// (verifyOtp), which the SSR callback consumes to set the session cookie. This
// is why we do NOT print the raw Supabase action_link (that one returns tokens
// in the URL fragment, which the PKCE callback cannot consume).
//
// Usage (from the repo root):
//   node --env-file=.env.local scripts/maglink.mjs <email> [next-path]
// Examples:
//   node --env-file=.env.local scripts/maglink.mjs melissa.blld+direction@gmail.com /coordination/administration
//   node --env-file=.env.local scripts/maglink.mjs coach.demo@sproclub.test /coaching
//
// Requires .env.local to point at the STAGING project:
//   NEXT_PUBLIC_SUPABASE_URL   = https://<staging-ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  = <staging service_role key>
// Optional overrides:
//   MAGLINK_APP_ORIGIN  (default https://sproclub-platform.vercel.app)
//
// The printed link is a single-use credential: paste it straight into your
// browser, do not share it. It expires quickly.

import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
const next = process.argv[3] ?? "/";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appOrigin =
  process.env.MAGLINK_APP_ORIGIN ?? "https://sproclub-platform.vercel.app";

if (!email) {
  console.error("usage: node --env-file=.env.local scripts/maglink.mjs <email> [next-path]");
  process.exit(1);
}
if (!url || !serviceRole || serviceRole.startsWith("placeholder")) {
  console.error(
    "Missing/placeholder Supabase env. Point .env.local at the STAGING project first."
  );
  process.exit(1);
}

const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Guard: only mint links for accounts that are actually provisioned (have a
// profile + membership). generateLink would otherwise silently create an
// incomplete auth user (type=signup, no role → /forbidden) and then block the
// proper Administration invite ("un compte existe déjà"). Invite first, then
// mint the link.
const { data: prof } = await admin
  .from("profiles")
  .select("id")
  .eq("email", email.trim().toLowerCase())
  .maybeSingle();
if (!prof) {
  console.error(
    `Aucun compte provisionné pour ${email}. Invite-le d'abord dans Administration, puis relance.`
  );
  process.exit(1);
}

const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo: `${appOrigin}/auth/callback` },
});

if (error) {
  console.error("Error:", error.message);
  process.exit(1);
}

const p = data?.properties;
if (!p?.hashed_token) {
  console.error("No hashed_token returned:", JSON.stringify(data, null, 2));
  process.exit(1);
}

const link =
  `${appOrigin}/auth/callback` +
  `?token_hash=${p.hashed_token}` +
  `&type=${p.verification_type ?? "magiclink"}` +
  `&next=${encodeURIComponent(next)}`;

console.log(`\nLien de connexion pour ${email} (usage unique, colle-le dans le navigateur) :\n`);
console.log(link);
console.log("");
