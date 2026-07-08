-- =============================================================================
-- SproCLUB platform — authentication & per-request organization context
-- Addendum to 0001_pilot_schema.sql and 0002_tenancy.sql.
--
-- Goals of this migration:
--   1. Make `memberships` (per-organization role) the single source of truth
--      for roles, per 0002. The global `user_roles` table from 0001 is left in
--      place for backwards compatibility but is no longer used by any policy.
--   2. Close the tenant isolation gap: the 0001 policies matched rows by e-mail
--      only, WITHOUT an org_id check, and used the global role table. Combined
--      with the 0002 tenant policies (permissive = OR'd), they would let a user
--      read another organization's rows on e-mail collision. We drop them and
--      install a single, org-scoped + role-scoped policy per table.
--   3. Provide a per-request organization context: `set_current_org(uuid)` sets
--      `app.current_org_id` (transaction-local) after checking membership, and
--      `current_org_id()` also falls back to a JWT `app_metadata.org_id` claim
--      so RLS keeps working under PostgREST connection pooling.
--
-- English identifiers, snake_case. Run AFTER 0001 and 0002.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) RLS helper functions must be SECURITY DEFINER to bypass RLS on the tables
--    they read. Otherwise `is_member`, called from the `memberships` SELECT
--    policy, would recurse (policy -> is_member -> reads memberships -> policy).
--    Redefines the 0002 helpers; behaviour is identical, only the security
--    context changes. Locked-down search_path to prevent hijacking.
-- -----------------------------------------------------------------------------
create or replace function is_member(target_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.profile_id = auth.uid() and m.org_id = target_org
  );
$$;

create or replace function has_org_role(target_org uuid, target app_role)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.profile_id = auth.uid() and m.org_id = target_org and m.role = target
  );
$$;

-- A member reads their OWN membership rows without recursion (direct predicate).
drop policy if exists membership_same_org on memberships;
drop policy if exists membership_self_read on memberships;
create policy membership_self_read on memberships
  for select using (profile_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 1) Organization context resolution
-- -----------------------------------------------------------------------------

-- current_org_id(): the active organization for this request. Resolved from the
-- per-request GUC when present (set inside a transaction by set_current_org),
-- otherwise from the authenticated user's JWT app_metadata.org_id claim. The
-- JWT path is what keeps RLS correct across pooled connections, where a GUC set
-- by a previous PostgREST request would not survive into the next one.
create or replace function current_org_id()
returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('app.current_org_id', true), ''),
    auth.jwt() -> 'app_metadata' ->> 'org_id'
  )::uuid;
$$;

-- set_current_org(): set the per-request organization context. SECURITY DEFINER
-- so it can read memberships, but it only ever accepts an org the CALLER belongs
-- to — never a way to escalate into another tenant. Transaction-local: intended
-- to be called at the start of a DB-side transaction / RPC that needs an
-- explicit org (e.g. multi-org users switching context).
create or replace function set_current_org(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from memberships m
    where m.profile_id = auth.uid() and m.org_id = p_org
  ) then
    raise exception 'not a member of organization %', p_org using errcode = '42501';
  end if;
  perform set_config('app.current_org_id', p_org::text, true);
end;
$$;

revoke all on function set_current_org(uuid) from public;
grant execute on function set_current_org(uuid) to authenticated;

-- has_current_org_role(): role check scoped to the ACTIVE organization only.
-- Replaces the global has_role() from 0001 in all policies below.
create or replace function has_current_org_role(target app_role)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.profile_id = auth.uid()
      and m.org_id = current_org_id()
      and m.role = target
  );
$$;

-- -----------------------------------------------------------------------------
-- 2) Drop the leaky global-role policies from 0001 and the coarse tenant
--    policies from 0002 that we are about to refine.
-- -----------------------------------------------------------------------------
drop policy if exists student_reads_own_enrollment   on enrollments_ro;
drop policy if exists coach_reads_own_learners        on enrollments_ro;
drop policy if exists staff_reads_all_enrollments     on enrollments_ro;
drop policy if exists tenant_isolation_enrollments    on enrollments_ro;

drop policy if exists student_manages_own_reservations on reservations;
drop policy if exists tenant_isolation_reservations    on reservations;

-- -----------------------------------------------------------------------------
-- 3) learners_ro: 0001 enabled RLS but created NO policy, so every subquery
--    that reads learners_ro (e.g. "the student's own learner row") returned
--    nothing. Add an explicit, org-scoped policy.
-- -----------------------------------------------------------------------------
drop policy if exists learners_read on learners_ro;
create policy learners_read on learners_ro
  for select using (
    org_id = current_org_id()
    and is_member(org_id)
    and (
      has_current_org_role('direction')
      or has_current_org_role('coordinator')
      or has_current_org_role('coach')
      or (
        has_current_org_role('student')
        and email = (select p.email from profiles p where p.id = auth.uid())
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 4) enrollments_ro: one org-scoped + role-scoped read policy.
--    * direction / coordinator: all enrollments of the active org
--    * coach: enrollments where they are the referent coach
--    * student: their own enrollment (matched by their profile e-mail)
-- -----------------------------------------------------------------------------
create policy enrollments_read on enrollments_ro
  for select using (
    org_id = current_org_id()
    and is_member(org_id)
    and (
      has_current_org_role('direction')
      or has_current_org_role('coordinator')
      or (
        has_current_org_role('coach')
        and coach_email = (select p.email from profiles p where p.id = auth.uid())
      )
      or (
        has_current_org_role('student')
        and learner_id in (
          select l.id from learners_ro l
          where l.org_id = current_org_id()
            and l.email = (select p.email from profiles p where p.id = auth.uid())
        )
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 5) reservations: students manage their own; staff read all in the org.
--    All operations are org-scoped.
-- -----------------------------------------------------------------------------
create policy reservations_student_manage on reservations
  for all
  using (
    org_id = current_org_id()
    and is_member(org_id)
    and has_current_org_role('student')
    and learner_id in (
      select l.id from learners_ro l
      where l.org_id = current_org_id()
        and l.email = (select p.email from profiles p where p.id = auth.uid())
    )
  )
  with check (
    org_id = current_org_id()
    and is_member(org_id)
    and has_current_org_role('student')
    and learner_id in (
      select l.id from learners_ro l
      where l.org_id = current_org_id()
        and l.email = (select p.email from profiles p where p.id = auth.uid())
    )
  );

create policy reservations_staff_read on reservations
  for select
  using (
    org_id = current_org_id()
    and is_member(org_id)
    and (
      has_current_org_role('direction')
      or has_current_org_role('coordinator')
      or has_current_org_role('coach')
      or has_current_org_role('evaluator')
    )
  );

-- -----------------------------------------------------------------------------
-- 6) profiles: a user reads their own profile; org staff read profiles of
--    people who share one of their organizations. RLS was enabled in 0001 with
--    no policy (deny-all), which would block the app from reading the caller's
--    own e-mail used by the policies above.
-- -----------------------------------------------------------------------------
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles
  for select using (id = auth.uid());

-- -----------------------------------------------------------------------------
-- NOTE on project_deliverables and availabilities: 0001 enabled RLS on them but
-- created no policy, so they are deny-all today. That is SAFE (no leak). They
-- get org_id columns and policies when their screens land (coach portal, Étape
-- 3 / booking, Étape 2). Left untouched here on purpose.
-- =============================================================================
