-- =============================================================================
-- SproCLUB platform — user & role management (INC-10)
-- Addendum to 0001 → 0011.
--
-- Goals of this migration:
--   1. Let direction / coordinator administer accounts from the app instead of
--      the database: invite (provisioning happens server-side with the service
--      role), grant / revoke roles, and DEACTIVATE an account without losing its
--      history. Deactivation must actually CUT server-side access, not merely
--      hide the person from a list.
--   2. Attribute every membership write (CA-T3 "toute action d'écriture est
--      horodatée et attribuée"): who invited a member (`invited_by`, alongside
--      the existing `created_at`) and who deactivated them, and when.
--   3. Add the first management RLS policies on `memberships` (0003 only allowed
--      self-read). RLS stays the authoritative server-side guard.
--
-- Deactivation model: `memberships.deactivated_at` (null = active). Because a
-- person may hold several role rows in one org, an account is deactivated by
-- stamping ALL of its rows; the role-resolution helpers below ignore stamped
-- rows, so a deactivated member fails `is_member` / `has_*_role` everywhere and
-- loses all access through RLS. Backwards compatible: existing rows default to
-- null (active), so no behaviour changes for current data.
--
-- English identifiers, snake_case; French user-facing error messages. Run AFTER
-- 0011.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Attribution & deactivation columns on memberships.
--    `created_at` already records WHEN a membership was granted; `invited_by`
--    records BY WHOM. `deactivated_at` / `deactivated_by` mirror that for the
--    deactivation event. All nullable → no impact on existing rows.
-- -----------------------------------------------------------------------------
alter table memberships add column if not exists invited_by     uuid references profiles (id) on delete set null;
alter table memberships add column if not exists deactivated_at timestamptz;
alter table memberships add column if not exists deactivated_by uuid references profiles (id) on delete set null;

-- Staff listing scans memberships by org; the only existing index is on
-- profile_id (0002). Add the org_id index.
create index if not exists memberships_org_id_idx on memberships (org_id);

-- -----------------------------------------------------------------------------
-- 2) Role-resolution helpers now ignore DEACTIVATED memberships. Redefinitions
--    of the 0003/0006 helpers; the only change is `and m.deactivated_at is null`
--    so a deactivated account resolves to no org, no role, no co-members —
--    i.e. deactivation cuts access at the RLS layer. SECURITY DEFINER + locked
--    search_path preserved (avoids recursion through the memberships policies).
-- -----------------------------------------------------------------------------
create or replace function is_member(target_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.profile_id = auth.uid()
      and m.org_id = target_org
      and m.deactivated_at is null
  );
$$;

create or replace function has_org_role(target_org uuid, target app_role)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.profile_id = auth.uid()
      and m.org_id = target_org
      and m.role = target
      and m.deactivated_at is null
  );
$$;

create or replace function has_current_org_role(target app_role)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.profile_id = auth.uid()
      and m.org_id = current_org_id()
      and m.role = target
      and m.deactivated_at is null
  );
$$;

create or replace function shares_org_with(target uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from memberships a
    join memberships b on a.org_id = b.org_id
    where a.profile_id = auth.uid()
      and b.profile_id = target
      and a.deactivated_at is null
      and b.deactivated_at is null
  );
$$;

-- set_current_org(): a deactivated member can no longer switch into the org.
create or replace function set_current_org(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from memberships m
    where m.profile_id = auth.uid()
      and m.org_id = p_org
      and m.deactivated_at is null
  ) then
    raise exception 'not a member of organization %', p_org using errcode = '42501';
  end if;
  perform set_config('app.current_org_id', p_org::text, true);
end;
$$;

revoke all on function set_current_org(uuid) from public;
grant execute on function set_current_org(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3) Management policies on memberships. 0003 kept only `membership_self_read`.
--    Add:
--      * staff read: direction / coordinator see every membership of the active
--        org (active AND deactivated), to render the user list.
--      * manage (insert / update / delete): direction / coordinator only, and a
--        coordinator may NEVER create, modify or remove a `direction` membership
--        (no privilege escalation). The `role <> 'direction'` guard sits in both
--        USING (existing row) and WITH CHECK (target row).
--    Self-read is preserved so every member can still see their own rows.
-- -----------------------------------------------------------------------------
drop policy if exists membership_staff_read on memberships;
create policy membership_staff_read on memberships
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );

drop policy if exists membership_manage on memberships;
create policy membership_manage on memberships
  for all
  using (
    org_id = current_org_id() and is_member(org_id)
    and (
      has_current_org_role('direction')
      or (has_current_org_role('coordinator') and role <> 'direction')
    )
  )
  with check (
    org_id = current_org_id() and is_member(org_id)
    and (
      has_current_org_role('direction')
      or (has_current_org_role('coordinator') and role <> 'direction')
    )
  );

-- -----------------------------------------------------------------------------
-- 4) Business invariant AT THE DATABASE level (per the 0004 precedent — an
--    invariant must not depend on the app layer): an organization can never be
--    left with ZERO active `direction` accounts. Blocks the last director being
--    removed or deactivated, no matter the client (app, raw PostgREST, RLS or
--    service role). The app layer (src/lib/data/members.ts) still checks it first
--    to return a friendly message; this trigger is the hard guarantee and also
--    closes the check-then-write race between two concurrent admins.
--
--    Cascade-safe: when the organization row is being deleted, its memberships
--    cascade away and this guard steps aside (the org is gone on purpose).
-- -----------------------------------------------------------------------------
create or replace function enforce_last_direction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_other_active int;
begin
  -- Only an ACTIVE direction row leaving the active set is relevant.
  if old.role <> 'direction' or old.deactivated_at is not null then
    return case tg_op when 'DELETE' then old else new end;
  end if;
  -- An update that keeps it an active direction row changes nothing.
  if tg_op = 'UPDATE' and new.role = 'direction' and new.deactivated_at is null then
    return new;
  end if;
  -- Let the organization teardown cascade proceed.
  if not exists (select 1 from organizations o where o.id = old.org_id) then
    return case tg_op when 'DELETE' then old else new end;
  end if;

  select count(*) into v_other_active
    from memberships m
    where m.org_id = old.org_id
      and m.role = 'direction'
      and m.deactivated_at is null
      and m.profile_id <> old.profile_id;
  if v_other_active = 0 then
    raise exception 'Impossible de retirer ou désactiver le dernier compte de direction actif de l''organisme.'
      using errcode = '23514';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_last_direction on memberships;
create trigger trg_last_direction
  before update or delete on memberships
  for each row execute function enforce_last_direction();
-- =============================================================================
