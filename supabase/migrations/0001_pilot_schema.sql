-- =============================================================================
-- SproCLUB intranet — pilot database schema (PostgreSQL / Supabase)
-- Scope: Étape 1 (foundations) + Étape 2 (pilot: student portal + booking)
-- Convention: snake_case, English identifiers, UTC timestamptz.
-- Airtable remains the system of record for business data; tables suffixed
-- "_ro" are read-models synced FROM Airtable. App-owned tables are writable.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type app_role     as enum ('direction', 'coordinator', 'coach', 'evaluator', 'student');
create type booking_kind as enum ('coaching', 'defense');            -- coaching vs soutenance
create type booking_status as enum ('pending', 'confirmed', 'declined', 'cancelled');

-- -----------------------------------------------------------------------------
-- Identity & roles (app-owned). profiles.id references Supabase auth.users.id
-- -----------------------------------------------------------------------------
create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null unique,
  full_name    text,
  created_at   timestamptz not null default now()
);

create table user_roles (
  profile_id uuid not null references profiles (id) on delete cascade,
  role       app_role not null,
  primary key (profile_id, role)          -- a user may be both coach and evaluator
);

-- -----------------------------------------------------------------------------
-- Read-models synced from Airtable (owned by Airtable, read-only in the app)
-- -----------------------------------------------------------------------------
create table learners_ro (
  id                 uuid primary key default gen_random_uuid(),
  airtable_record_id text not null unique,          -- Etudiant record id
  unique_learner_id  text not null,                 -- INT_ID_Apprenant (Étape 0)
  first_name         text,
  last_name          text,
  email              text not null,
  synced_at          timestamptz not null default now()
);
create index on learners_ro (email);
create index on learners_ro (unique_learner_id);

create table enrollments_ro (
  id                 uuid primary key default gen_random_uuid(),
  airtable_record_id text not null unique,          -- Commandes Formation record id
  learner_id         uuid not null references learners_ro (id) on delete cascade,
  program            text,
  specialty          text,                          -- INT_Spécialité (Étape 0)
  financer           text,
  status             text,
  start_date         date,
  end_date           date,
  access_end_date    date,
  coach_email        text,                          -- referent coach; used for independence rule
  synced_at          timestamptz not null default now()
);
create index on enrollments_ro (learner_id);
create index on enrollments_ro (coach_email);

-- Projects / deliverables. deliverable_submitted opens defense booking (gating).
create table project_deliverables (
  id                    uuid primary key default gen_random_uuid(),
  enrollment_id         uuid not null references enrollments_ro (id) on delete cascade,
  project_number        int  not null,
  deliverable_submitted boolean not null default false,
  deliverable_url       text,
  submitted_at          timestamptz,
  unique (enrollment_id, project_number)
);

-- -----------------------------------------------------------------------------
-- Evaluator pool per program (app-owned). Enforces "jury of two, never the coach".
-- -----------------------------------------------------------------------------
create table evaluator_pool (
  program            text not null,
  evaluator_id       uuid not null references profiles (id) on delete cascade,
  primary key (program, evaluator_id)
);

-- -----------------------------------------------------------------------------
-- Availabilities (mirrored from Cal.com / Google Calendar). Two calendars.
-- -----------------------------------------------------------------------------
create table availabilities (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid not null references profiles (id) on delete cascade,
  kind          booking_kind not null,             -- 'coaching' or 'defense'
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  calcom_ref    text,
  synced_at     timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on availabilities (kind, starts_at);
create index on availabilities (host_id, kind);

-- -----------------------------------------------------------------------------
-- Reservations (app-owned; pushed to Airtable Planning/Soutenances on confirm)
-- -----------------------------------------------------------------------------
create table reservations (
  id                uuid primary key default gen_random_uuid(),
  learner_id        uuid not null references learners_ro (id) on delete cascade,
  enrollment_id     uuid not null references enrollments_ro (id) on delete cascade,
  kind              booking_kind not null,
  project_number    int,                            -- required when kind = 'defense'
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  status            booking_status not null default 'pending',
  calcom_booking_id text,
  confirmed_by      uuid references profiles (id),
  airtable_synced   boolean not null default false,
  created_at        timestamptz not null default now(),
  check (ends_at > starts_at),
  check (kind = 'coaching' or project_number is not null)
);
create index on reservations (learner_id, status);
create index on reservations (kind, starts_at);
-- one active defense slot per project (Étape 2 rule)
create unique index one_active_defense_per_project
  on reservations (enrollment_id, project_number)
  where kind = 'defense' and status in ('pending', 'confirmed');

-- Jury: exactly two evaluators for a defense reservation.
create table reservation_evaluators (
  reservation_id uuid not null references reservations (id) on delete cascade,
  evaluator_id   uuid not null references profiles (id) on delete cascade,
  primary key (reservation_id, evaluator_id)
);

-- -----------------------------------------------------------------------------
-- Sync log (observability of Airtable <-> Postgres flows)
-- -----------------------------------------------------------------------------
create table sync_log (
  id           bigint generated always as identity primary key,
  entity       text not null,                       -- e.g. 'learners_ro'
  direction    text not null,                       -- 'airtable_to_pg' | 'pg_to_airtable'
  record_ref   text,
  status       text not null,                       -- 'ok' | 'error'
  detail       text,
  ran_at       timestamptz not null default now()
);

-- =============================================================================
-- Row Level Security — server-side isolation (Étape 1 / CA-E1-2)
-- =============================================================================
alter table profiles              enable row level security;
alter table learners_ro           enable row level security;
alter table enrollments_ro        enable row level security;
alter table project_deliverables  enable row level security;
alter table availabilities        enable row level security;
alter table reservations          enable row level security;
alter table reservation_evaluators enable row level security;

-- Helper: current user's roles
create or replace function has_role(target app_role)
returns boolean language sql stable as $$
  select exists (
    select 1 from user_roles ur
    where ur.profile_id = auth.uid() and ur.role = target
  );
$$;

-- A student sees only their own enrollment (matched by email).
create policy student_reads_own_enrollment on enrollments_ro
  for select using (
    has_role('student')
    and learner_id in (
      select l.id from learners_ro l
      where l.email = (select email from profiles where id = auth.uid())
    )
  );

-- A coach sees only enrollments where they are the referent coach.
create policy coach_reads_own_learners on enrollments_ro
  for select using (
    has_role('coach')
    and coach_email = (select email from profiles where id = auth.uid())
  );

-- Direction and coordinator read everything.
create policy staff_reads_all_enrollments on enrollments_ro
  for select using (has_role('direction') or has_role('coordinator'));

-- A student manages only their own reservations.
create policy student_manages_own_reservations on reservations
  for all using (
    has_role('student')
    and learner_id in (
      select l.id from learners_ro l
      where l.email = (select email from profiles where id = auth.uid())
    )
  ) with check (
    learner_id in (
      select l.id from learners_ro l
      where l.email = (select email from profiles where id = auth.uid())
    )
  );

-- NOTE: the "jury of two, never the referent coach" rule is enforced in the
-- booking service (application layer) and re-checked by a DB trigger before
-- confirmation. Availabilities and evaluator_pool feed the collective slot
-- computation; the referent coach (enrollments_ro.coach_email) is excluded.
