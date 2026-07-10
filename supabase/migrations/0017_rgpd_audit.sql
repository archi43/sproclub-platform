-- =============================================================================
-- SproCLUB platform — RGPD : journal d'audit & droit à l'oubli (INC-11)
-- Addendum to 0001 → 0016.
--
--   1. `audit_log` — traces access to learner dossiers (and other sensitive
--      actions). Written through the SECURITY DEFINER `log_access()` so a caller
--      can only ever record an entry for THEIR OWN org and identity. Direction /
--      coordinator read their org's journal.
--   2. `data_erasures` — the right-to-erasure suppression list (keyed by the
--      learner's source e-mail). The Airtable→Postgres sync consults it and
--      SKIPS re-importing an erased learner, so anonymization performed once is
--      not undone by the next sync.
--
-- English identifiers, French user-facing text. Run AFTER 0016.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Audit log
-- -----------------------------------------------------------------------------
create table if not exists audit_log (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references organizations (id) on delete cascade,
  actor_id     uuid references profiles (id) on delete set null,
  action       text not null,            -- e.g. 'dossier.view', 'dossier.export', 'dossier.erase'
  subject_type text not null,            -- e.g. 'learner'
  subject_id   uuid,                     -- e.g. learners_ro.id
  detail       text,
  at           timestamptz not null default now()
);
create index if not exists audit_log_org_at_idx on audit_log (org_id, at desc);
create index if not exists audit_log_subject_idx on audit_log (subject_type, subject_id);

alter table audit_log enable row level security;

-- Direction / coordinator read their organization's journal.
drop policy if exists audit_log_staff_read on audit_log;
create policy audit_log_staff_read on audit_log
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );
-- No client insert policy — entries are written only via log_access() below.

-- log_access(): record an audit entry for the CALLER, in their active org. The
-- actor and org are taken from the session (auth.uid() / current_org_id()), so a
-- caller cannot forge an entry for someone else or another tenant.
create or replace function log_access(
  p_action text,
  p_subject_type text,
  p_subject_id uuid,
  p_detail text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := current_org_id();
begin
  if v_org is null or not is_member(v_org) then
    return; -- no active membership → nothing to log (fail-closed, no error)
  end if;
  -- Only staff record dossier-access entries, and only known actions — so a
  -- student/coach cannot pollute or forge the RGPD journal with arbitrary rows.
  if not (has_current_org_role('direction') or has_current_org_role('coordinator')) then
    return;
  end if;
  if p_action not in ('dossier.view', 'dossier.export', 'dossier.erase') then
    return;
  end if;
  insert into audit_log (org_id, actor_id, action, subject_type, subject_id, detail)
  values (v_org, auth.uid(), p_action, p_subject_type, p_subject_id, p_detail);
end;
$$;
revoke all on function log_access(text, text, uuid, text) from public;
grant execute on function log_access(text, text, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 2) Right-to-erasure suppression list
-- -----------------------------------------------------------------------------
create table if not exists data_erasures (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  learner_email text not null check (learner_email = lower(learner_email)), -- lowercased source e-mail, the sync key
  requested_by  uuid references profiles (id) on delete set null,
  requested_at  timestamptz not null default now(),
  unique (org_id, learner_email)
);
create index if not exists data_erasures_org_idx on data_erasures (org_id);

-- Enforce the lowercase invariant even if the table pre-existed (re-applied
-- migration): the sync skip-list compares raw values, so casing must be fixed.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'data_erasures_email_lower') then
    alter table data_erasures add constraint data_erasures_email_lower check (learner_email = lower(learner_email));
  end if;
end $$;

alter table data_erasures enable row level security;

-- Direction / coordinator read the erasure register of their org.
drop policy if exists data_erasures_staff_read on data_erasures;
create policy data_erasures_staff_read on data_erasures
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );
-- Writes are service-role only (erasure runs from a guarded server action).

-- is_erased(): does an org suppress this (lowercased) e-mail? SECURITY DEFINER so
-- the sync (service role) and app can both consult it without RLS friction.
create or replace function is_erased(p_org uuid, p_email text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from data_erasures d
    where d.org_id = p_org and d.learner_email = lower(p_email)
  );
$$;
-- =============================================================================
