-- =============================================================================
-- SproCLUB platform — explicit grants for the Supabase API roles
-- Addendum to 0001 → 0010.
--
-- In hosted Supabase, default privileges automatically grant table access to
-- the API roles (anon, authenticated, service_role), so migrations written for
-- the hosted platform omit GRANTs. A bare local / CI Postgres (supabase start)
-- does NOT apply those grants to migration-created tables, so service_role hits
-- "permission denied for table …". Make the grants explicit so the schema is
-- self-sufficient anywhere. Idempotent and safe in prod (already granted there).
--
-- Access remains gated by Row Level Security: these grants only let a role reach
-- a table; the RLS policies decide which rows. service_role bypasses RLS by
-- design (trusted server key).
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

-- Future objects created by the migration role inherit the same grants.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
-- =============================================================================
