-- =============================================================================
-- SproCLUB platform — espace apprenant : documents (INC-8, écran P.A2)
-- Addendum to 0001 → 0014.
--
-- A private Supabase Storage bucket for learner documents (attestations,
-- convention, certificat…), isolated PER ORGANIZATION and PER LEARNER by Row
-- Level Security on `storage.objects`.
--
-- Path convention (object `name`):  {org_id}/{learner_email}/{filename}
--   - segment 1 = organization id  → tenant isolation
--   - segment 2 = learner e-mail    → a learner only reaches their own folder
--
-- Reads:  a student reads objects under {their org}/{their e-mail}/… ;
--         direction/coordinator read everything under {their org}/… .
-- Writes: no client policy → only the service role (trusted server jobs, and the
--         document generation of INC-9) may write. RLS is the server-side guard.
--
-- English identifiers. Run AFTER 0014.
-- =============================================================================

-- Private bucket (id = name). Idempotent.
insert into storage.buckets (id, name, public)
values ('learner-docs', 'learner-docs', false)
on conflict (id) do nothing;

-- Helper: the caller's org id from the JWT app_metadata claim (storage requests
-- run under PostgREST pooling, so the claim is the reliable source — same idea
-- as current_org_id() in 0003). Returns text to compare with the path segment.
create or replace function storage_caller_org()
returns text
language sql stable as $$
  select auth.jwt() -> 'app_metadata' ->> 'org_id';
$$;

-- Caller's e-mail (from their profile).
create or replace function storage_caller_email()
returns text
language sql stable security definer set search_path = public as $$
  select p.email from profiles p where p.id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- Student: read own documents ({org}/{own e-mail}/…).
-- -----------------------------------------------------------------------------
drop policy if exists learner_docs_student_read on storage.objects;
create policy learner_docs_student_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'learner-docs'
    and (storage.foldername(name))[1] = storage_caller_org()
    and (storage.foldername(name))[2] = storage_caller_email()
    and has_current_org_role('student')
  );

-- -----------------------------------------------------------------------------
-- Direction / coordinator: read every document of their organization.
-- -----------------------------------------------------------------------------
drop policy if exists learner_docs_staff_read on storage.objects;
create policy learner_docs_staff_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'learner-docs'
    and (storage.foldername(name))[1] = storage_caller_org()
    and is_member((storage.foldername(name))[1]::uuid)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );
-- (No insert/update/delete policy → writes are service-role only.)
-- =============================================================================
