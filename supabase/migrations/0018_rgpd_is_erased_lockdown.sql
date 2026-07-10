-- =============================================================================
-- SproCLUB platform — RGPD hardening (INC-11 follow-up to 0017)
--
-- `is_erased()` (0017) is SECURITY DEFINER but had no explicit grant, so it kept
-- Postgres' default EXECUTE-to-PUBLIC. Through PostgREST that means `anon` and
-- `authenticated` could call it with ANY (org_id, e-mail) — leaking, without any
-- org membership, whether a given person requested erasure in ANY organisation
-- (cross-tenant PII disclosure). Unlike is_member()/has_current_org_role(), the
-- function derives nothing from auth.uid(), so it cannot self-scope.
--
-- Fix: the suppression list is a server-side concern. Only the service role (the
-- Airtable→Postgres sync) needs this helper; revoke it from everyone else.
-- Idempotent. Run AFTER 0017.
-- =============================================================================

revoke all on function is_erased(uuid, text) from public;
grant execute on function is_erased(uuid, text) to service_role;
-- =============================================================================
