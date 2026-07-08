-- =============================================================================
-- SproCLUB platform — RLS hardening
-- Addendum to 0001 → 0006.
--
-- 0001 left two public tables WITHOUT row level security. With Supabase's
-- default grants to `anon`/`authenticated`, a table without RLS is fully
-- reachable through PostgREST. Enable RLS with NO policy (deny-all): both tables
-- are only ever touched by trusted server code using the service role, which
-- bypasses RLS. This closes the exposure without changing app behaviour.
--
--   * sync_log   — operability log written by sync jobs (service role only).
--   * user_roles — legacy global roles from 0001, superseded by `memberships`
--                  and used by no policy. Kept for now; see the note below.
-- Run AFTER 0006.
-- =============================================================================

alter table sync_log   enable row level security;
alter table user_roles enable row level security;

-- NOTE: `user_roles` and the `has_role(app_role)` function (0001) are dead code —
-- roles now live in `memberships` (0002) and no policy references them. Dropping
-- them is recommended but destructive, so it is intentionally left out of this
-- migration; do it deliberately once confirmed:
--   drop function if exists has_role(app_role);
--   drop table if exists user_roles;
-- =============================================================================
