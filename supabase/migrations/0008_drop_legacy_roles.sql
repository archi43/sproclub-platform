-- =============================================================================
-- SproCLUB platform — drop legacy global roles (dead code)
-- Addendum to 0001 → 0007.
--
-- `user_roles` (global roles) and `has_role(app_role)` from 0001 were superseded
-- by `memberships` (per-organization roles, 0002). Verified unused before drop:
-- 0 rows, no policy/function/foreign-key references them. Removing them shrinks
-- the attack surface and the schema. The `app_role` enum stays (used by
-- memberships).
-- Run AFTER 0007.
-- =============================================================================

drop function if exists has_role(app_role);
drop table if exists user_roles;
-- =============================================================================
