-- =============================================================================
-- SproCLUB platform — RGPD hardening, complete `is_erased` lockdown (INC-11)
--
-- 0018 revoked EXECUTE from PUBLIC, but Supabase installs a default privilege
-- (ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,
-- authenticated, service_role), so at creation `is_erased` (0017) also received a
-- DIRECT grant to `anon` and `authenticated`. A revoke from PUBLIC does not
-- remove those direct grants — so anon/authenticated could still call the
-- function with ANY (org_id, e-mail) and learn cross-tenant erasure status.
--
-- Revoke from those roles explicitly; keep EXECUTE for the service role only (the
-- sync). Idempotent; run AFTER 0018.
-- =============================================================================

revoke execute on function is_erased(uuid, text) from anon, authenticated, public;
grant execute on function is_erased(uuid, text) to service_role;
-- =============================================================================
