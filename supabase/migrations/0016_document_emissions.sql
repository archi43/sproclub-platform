-- =============================================================================
-- SproCLUB platform — journal d'émission des documents (INC-9)
-- Addendum to 0001 → 0015.
--
-- Tracks every generated Qualiopi document (attestation d'entrée / de fin,
-- convention, convocation de soutenance): what was issued, for which dossier,
-- by whom, when, and where it is archived in Storage (bucket `learner-docs`,
-- 0015). The PDF bytes live in Storage; this table is the searchable emission
-- log ("archivé et retrouvable").
--
-- The generation itself runs with the service role (only it may write to the
-- Storage bucket, 0015) behind a direction/coordinator route guard; the row is
-- inserted the same way. RLS below governs who may READ the journal.
--
-- English identifiers, French user-facing text elsewhere. Run AFTER 0015.
-- =============================================================================

create table if not exists document_emissions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  enrollment_id uuid not null references enrollments_ro (id) on delete cascade,
  learner_email text not null,
  kind          text not null,          -- attestation_entree | attestation_fin | convention | convocation_soutenance
  storage_path  text not null,          -- {org_id}/{email}/{file}.pdf in learner-docs
  generated_by  uuid references profiles (id) on delete set null,
  generated_at  timestamptz not null default now()
);
create index if not exists document_emissions_org_idx on document_emissions (org_id);
create index if not exists document_emissions_enrollment_idx on document_emissions (enrollment_id);

alter table document_emissions enable row level security;

-- Direction / coordinator read the whole org's emission journal.
drop policy if exists document_emissions_staff_read on document_emissions;
create policy document_emissions_staff_read on document_emissions
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );

-- A student sees the emissions of their own dossier (their document history).
drop policy if exists document_emissions_student_read on document_emissions;
create policy document_emissions_student_read on document_emissions
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and has_current_org_role('student')
    and learner_email = (select p.email from profiles p where p.id = auth.uid())
  );
-- (No client insert/update/delete policy → writes are service-role only.)

-- Organization consistency (the service role bypasses RLS, so enforce it in the
-- DB, per the 0004 precedent): an emission must belong to the same org as its
-- enrollment. Backfills org_id when omitted.
create or replace function enforce_emission_org()
returns trigger language plpgsql security definer set search_path = public as $$
declare e_org uuid;
begin
  select org_id into e_org from enrollments_ro where id = new.enrollment_id;
  if new.org_id is null then new.org_id := e_org; end if;
  if e_org is null or new.org_id <> e_org then
    raise exception 'Incohérence d''organisme entre le document et le dossier.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_emission_org on document_emissions;
create trigger trg_emission_org
  before insert or update on document_emissions
  for each row execute function enforce_emission_org();
-- =============================================================================
