-- =============================================================================
-- SproCLUB platform — INC-14: Fillout as an evaluation source
-- Addendum to 0001 → 0021.
--
-- Decision (CDC alignment): evaluations can arrive from the native coach UI
-- ("platform") OR from Fillout forms ("fillout"), into the SAME table, with the
-- source traced. Fillout submissions have no platform author, so author_id
-- becomes nullable (native writes still always set it; the coach RLS policies
-- are unaffected — a NULL author row simply belongs to no coach).
-- Run AFTER 0021.
-- =============================================================================

alter table coaching_reports
  add column source text not null default 'platform'
    check (source in ('platform', 'fillout')),
  add column fillout_submission_id text unique,
  alter column author_id drop not null;

create index if not exists coaching_reports_writeback_idx
  on coaching_reports (org_id, airtable_synced);
-- =============================================================================
