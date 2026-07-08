-- =============================================================================
-- SproCLUB platform — learner uniqueness for idempotent sync (INC-1)
-- Addendum to 0001 → 0008.
--
-- The Airtable → Postgres sync deduplicates learners by normalized e-mail within
-- an organization (a person = one learners_ro row). Add the matching unique
-- constraint so the sync can upsert on (org_id, email) safely and idempotently.
-- E-mails are already lower-cased at write time (0005).
-- Run AFTER 0008.
-- =============================================================================

create unique index if not exists learners_ro_org_email_key
  on learners_ro (org_id, email);
-- =============================================================================
