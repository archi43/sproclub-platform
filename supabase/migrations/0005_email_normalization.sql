-- =============================================================================
-- SproCLUB platform — e-mail normalization safeguard
-- Addendum to 0001 → 0004.
--
-- RLS ties a user to their data by matching e-mails (learners_ro.email /
-- enrollments_ro.coach_email against the authenticated profile e-mail). Those
-- comparisons are case-sensitive, so a single mixed-case e-mail from a future
-- sync (e.g. Airtable → Postgres) would silently break the RLS link.
--
-- Enforce lower-case e-mails AT WRITE TIME on the app-visible tables. Supabase
-- Auth already lower-cases auth.users e-mails, and the login form normalizes
-- input; this closes the remaining door (synced read-models). Idempotent and
-- non-destructive: current data is already lower-case.
-- =============================================================================

create or replace function lowercase_email()
returns trigger language plpgsql as $$
begin
  if new.email is not null then
    new.email := lower(new.email);
  end if;
  return new;
end;
$$;

create or replace function lowercase_coach_email()
returns trigger language plpgsql as $$
begin
  if new.coach_email is not null then
    new.coach_email := lower(new.coach_email);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lower_email on profiles;
create trigger trg_lower_email
  before insert or update on profiles
  for each row execute function lowercase_email();

drop trigger if exists trg_lower_email on learners_ro;
create trigger trg_lower_email
  before insert or update on learners_ro
  for each row execute function lowercase_email();

drop trigger if exists trg_lower_coach_email on enrollments_ro;
create trigger trg_lower_coach_email
  before insert or update on enrollments_ro
  for each row execute function lowercase_coach_email();

-- One-time normalization of any pre-existing rows (no-op today).
update profiles      set email = lower(email)             where email <> lower(email);
update learners_ro   set email = lower(email)             where email <> lower(email);
update enrollments_ro set coach_email = lower(coach_email) where coach_email is not null and coach_email <> lower(coach_email);
-- =============================================================================
