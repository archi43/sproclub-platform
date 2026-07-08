-- =============================================================================
-- SproCLUB platform — staff coordination policies
-- Addendum to 0001 → 0005. Enables the coordination (jury assignment) screen:
--   * staff can read the profiles of people who share one of their orgs
--     (to display evaluators / coaches by name);
--   * direction/coordinator can update reservations in their org
--     (confirm / decline a defense).
-- The jury rules themselves (two evaluators, never the referent coach, pool
-- membership) stay enforced by the 0004 triggers.
-- Run AFTER 0005.
-- =============================================================================

-- Does the current user share at least one organization with `target`?
-- SECURITY DEFINER to bypass RLS on memberships (avoids recursion and lets a
-- member resolve co-members).
create or replace function shares_org_with(target uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from memberships a
    join memberships b on a.org_id = b.org_id
    where a.profile_id = auth.uid() and b.profile_id = target
  );
$$;

-- Members can read the profiles of their co-members (subsumes self-read).
drop policy if exists profiles_org_read on profiles;
create policy profiles_org_read on profiles
  for select using (shares_org_with(id));

-- Direction / coordinator can update reservations in the active org (confirm,
-- decline). Insertion stays with the student (reservations_student_manage); the
-- defense confirmation gate (0004) still applies on the status transition.
drop policy if exists reservations_staff_manage on reservations;
create policy reservations_staff_manage on reservations
  for update
  using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  )
  with check (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );
-- =============================================================================
