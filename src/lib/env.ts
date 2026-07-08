/** Centralised, validated environment access. Fails fast if a var is missing. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  appBaseDomain: process.env.APP_BASE_DOMAIN ?? "localhost:3000",
};

/** Server-only secret. Never import this from client components. */
export function serviceRoleKey(): string {
  return required("SUPABASE_SERVICE_ROLE_KEY");
}
