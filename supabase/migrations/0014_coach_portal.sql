-- =============================================================================
-- SproCLUB platform — portail coach + comptes rendus (INC-4, Étape 3)
-- Addendum to 0001 → 0013.
--
-- Two things:
--   1. TIGHTEN the coach read scope. Today `enrollments_read` (0003) already
--      narrows a coach to their own dossiers (coach_email match), but
--      `learners_read` (0003), `reservations_staff_read` (0003),
--      `deliverables_staff_read` (0004) and `reservation_evaluators_read` (0004)
--      grant a coach an ORG-WIDE read. For a watertight coach portal, a coach
--      must see only the learners / bookings / deliverables / juries of their OWN
--      dossiers. Direction, coordinator (and evaluator, where applicable) keep
--      their existing broad read.
--   2. Add `coaching_reports` — coach-entered session reports & notes
--      (app-owned, like reservations). RLS: a coach manages the reports of their
--      own dossiers; direction/coordinator read all. This is the Postgres "the
--      coach's entries show up for admin" path; the Airtable write-back is a
--      later, credential-gated step (a write-scoped token is required).
--
-- IMPORTANT: the coach-scoping predicates read `enrollments_ro` / `reservations`
-- to resolve "is this the caller-coach's dossier". Doing that as an inline
-- subquery INSIDE a policy on `learners_ro`/`reservations`/... would recurse
-- through those tables' own policies (learners_ro -> enrollments_ro ->
-- learners_ro …). So we resolve it through SECURITY DEFINER helpers that bypass
-- RLS on the tables they read — the same technique as `is_member` (0003). Each
-- helper only ever exposes a boolean scoped to the caller's own coach e-mail and
-- active org, so there is no leak.
--
-- English identifiers, snake_case; French user-facing messages. Run AFTER 0013.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Coach-scoping helpers (SECURITY DEFINER, locked search_path).
-- -----------------------------------------------------------------------------
create or replace function is_coach_of_enrollment(target_enrollment uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enrollments_ro e
    where e.id = target_enrollment
      and e.org_id = current_org_id()
      and e.coach_email = (select p.email from profiles p where p.id = auth.uid())
  );
$$;

create or replace function is_coach_of_learner(target_learner uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enrollments_ro e
    where e.learner_id = target_learner
      and e.org_id = current_org_id()
      and e.coach_email = (select p.email from profiles p where p.id = auth.uid())
  );
$$;

create or replace function is_coach_of_reservation(target_reservation uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from reservations r
    join enrollments_ro e on e.id = r.enrollment_id
    where r.id = target_reservation
      and r.org_id = current_org_id()
      and e.coach_email = (select p.email from profiles p where p.id = auth.uid())
  );
$$;

-- -----------------------------------------------------------------------------
-- 1a) learners_read — coach narrowed to learners they actually coach.
-- -----------------------------------------------------------------------------
drop policy if exists learners_read on learners_ro;
create policy learners_read on learners_ro
  for select using (
    org_id = current_org_id()
    and is_member(org_id)
    and (
      has_current_org_role('direction')
      or has_current_org_role('coordinator')
      or (has_current_org_role('coach') and is_coach_of_learner(id))
      or (
        has_current_org_role('student')
        and email = (select p.email from profiles p where p.id = auth.uid())
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 1b) reservations_staff_read — coach narrowed to their own dossiers' bookings;
--     direction/coordinator/evaluator keep the broad read.
-- -----------------------------------------------------------------------------
drop policy if exists reservations_staff_read on reservations;
create policy reservations_staff_read on reservations
  for select using (
    org_id = current_org_id()
    and is_member(org_id)
    and (
      has_current_org_role('direction')
      or has_current_org_role('coordinator')
      or has_current_org_role('evaluator')
      or (has_current_org_role('coach') and is_coach_of_enrollment(enrollment_id))
    )
  );

-- -----------------------------------------------------------------------------
-- 1c) deliverables_staff_read — coach narrowed to their own dossiers.
-- -----------------------------------------------------------------------------
drop policy if exists deliverables_staff_read on project_deliverables;
create policy deliverables_staff_read on project_deliverables
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (
      has_current_org_role('direction')
      or has_current_org_role('coordinator')
      or (has_current_org_role('coach') and is_coach_of_enrollment(enrollment_id))
    )
  );

-- -----------------------------------------------------------------------------
-- 1d) reservation_evaluators_read — coach narrowed to their own dossiers' juries.
--     Direction/coordinator/evaluator keep the broad read; a student still reads
--     the jury of their OWN reservation.
-- -----------------------------------------------------------------------------
drop policy if exists reservation_evaluators_read on reservation_evaluators;
create policy reservation_evaluators_read on reservation_evaluators
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (
      has_current_org_role('direction')
      or has_current_org_role('coordinator')
      or has_current_org_role('evaluator')
      or (has_current_org_role('coach') and is_coach_of_reservation(reservation_id))
      or reservation_id in (
        select r.id from reservations r
        join learners_ro l on l.id = r.learner_id
        where r.org_id = current_org_id()
          and l.email = (select p.email from profiles p where p.id = auth.uid())
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 2) coaching_reports — coach session reports & notes (app-owned).
-- -----------------------------------------------------------------------------
create table if not exists coaching_reports (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations (id) on delete cascade,
  enrollment_id     uuid not null references enrollments_ro (id) on delete cascade,
  reservation_id    uuid references reservations (id) on delete set null,
  author_id         uuid not null references profiles (id),
  session_date      date,
  body              text not null,
  grade             numeric,               -- optional note (e.g. on 4), free scale
  airtable_record_id text,                 -- set once written back (later, gated)
  airtable_synced   boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists coaching_reports_org_id_idx on coaching_reports (org_id);
create index if not exists coaching_reports_enrollment_idx on coaching_reports (enrollment_id);

alter table coaching_reports enable row level security;

-- A coach manages (reads/writes) the reports of dossiers they coach, and can
-- only author as themselves.
drop policy if exists coaching_reports_coach_manage on coaching_reports;
create policy coaching_reports_coach_manage on coaching_reports
  for all
  using (
    org_id = current_org_id() and is_member(org_id)
    and has_current_org_role('coach') and is_coach_of_enrollment(enrollment_id)
  )
  with check (
    org_id = current_org_id() and is_member(org_id)
    and has_current_org_role('coach') and author_id = auth.uid()
    and is_coach_of_enrollment(enrollment_id)
  );

-- Direction / coordinator read every report of the org (admin visibility).
drop policy if exists coaching_reports_staff_read on coaching_reports;
create policy coaching_reports_staff_read on coaching_reports
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );

-- Organization consistency: a report must belong to the same org as its
-- enrollment (backfills org_id when omitted).
create or replace function enforce_coaching_report_org()
returns trigger language plpgsql security definer set search_path = public as $$
declare e_org uuid;
begin
  select org_id into e_org from enrollments_ro where id = new.enrollment_id;
  if new.org_id is null then new.org_id := e_org; end if;
  if e_org is null or new.org_id <> e_org then
    raise exception 'Incohérence d''organisme entre le compte rendu et le dossier.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_coaching_report_org on coaching_reports;
create trigger trg_coaching_report_org
  before insert or update on coaching_reports
  for each row execute function enforce_coaching_report_org();
-- =============================================================================
