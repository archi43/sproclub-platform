-- =============================================================================
-- SproCLUB platform — admin: référentiel + 360 learner fields (INC-2)
-- Addendum to 0001 → 0009.
--
--   1. Module 4: `programs` catalogue (org-scoped, RLS), with the publication
--      rule (no publish without 360L path + syllabus + eval modalities).
--   2. Module 2: extra columns on learners_ro / enrollments_ro so the 360
--      learner sheet shows real data (progress, certification, insertion,
--      satisfaction…). All additive & nullable; populated by the INC-1 sync.
-- Run AFTER 0009.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Programs catalogue (Module 4 / S4.1)
-- -----------------------------------------------------------------------------
create table programs (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations (id),
  name             text not null,
  specialty        text,
  family           text,                       -- SAP, Odoo, HubSpot, …
  rncp             text,                        -- RNCP / RS certification prepared
  cpf_eligible     boolean not null default false,
  published        boolean not null default false,
  path_360l        text,                        -- required before publishing
  syllabus_url     text,                        -- required before publishing
  eval_modalities  text,                        -- required before publishing
  created_at       timestamptz not null default now()
);
create index on programs (org_id);
alter table programs enable row level security;

-- Staff read: direction/coordinator see all; coach/evaluator see published only.
create policy programs_read on programs
  for select using (
    org_id = current_org_id() and is_member(org_id) and (
      has_current_org_role('direction') or has_current_org_role('coordinator')
      or (published and (has_current_org_role('coach') or has_current_org_role('evaluator')))
    )
  );

-- Direction / coordinator manage the catalogue.
create policy programs_manage on programs
  for all
  using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  )
  with check (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );

-- Publication rule (S4.1): a program cannot be published without a 360L path,
-- a syllabus and evaluation modalities.
create or replace function enforce_program_publish()
returns trigger language plpgsql as $$
begin
  if new.published
     and (coalesce(new.path_360l, '') = ''
          or coalesce(new.syllabus_url, '') = ''
          or coalesce(new.eval_modalities, '') = '') then
    raise exception 'Publication impossible : renseignez le parcours 360L, le syllabus et les modalités d''évaluation.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_program_publish on programs;
create trigger trg_program_publish
  before insert or update on programs
  for each row execute function enforce_program_publish();

-- -----------------------------------------------------------------------------
-- 2) 360 learner-sheet fields (Module 2 / S2.2), populated by the sync.
-- -----------------------------------------------------------------------------
alter table learners_ro
  add column phone        text,
  add column city         text,
  add column trainee_type text;

alter table enrollments_ro
  add column progress               numeric,
  add column late_days              int,
  add column projects_validated     int,
  add column projects_required      int,
  add column global_grade           numeric,
  add column certification          text,
  add column certification_exam_date date,
  add column jury_result            text,
  add column insertion_situation    text,
  add column insertion_role         text,
  add column insertion_contract     text,
  add column insertion_company      text,
  add column satisfaction_score     numeric,
  add column nps                    numeric,
  add column attestation_entry_sent boolean,
  add column attestation_end_sent   boolean,
  add column convention_signed      boolean,
  add column site                   text;
-- =============================================================================
