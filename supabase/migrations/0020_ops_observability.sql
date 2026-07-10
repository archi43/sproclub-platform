-- =============================================================================
-- SproCLUB platform — Exploitation & observabilité (INC-12)
-- Addendum to 0001 → 0019.
--
--   1. `ops_events` — journal opérationnel (erreurs serveur, tentatives d'accès
--      refusées, blocages de débit, résumés de cron). Porté par `org_id`, lu par
--      la direction/coordination via RLS ; écrit côté serveur (service role).
--   2. `rate_limit_events` + `rate_limit_touch()` — compteur de débit à fenêtre
--      glissante pour freiner l'abus sur les points d'entrée publics (login…).
--      Table verrouillée (RLS sans policy) : accès uniquement par la fonction
--      SECURITY DEFINER et le service role.
--
-- English identifiers, French user-facing text. Run AFTER 0019.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Operational event log (observability)
-- -----------------------------------------------------------------------------
create table if not exists ops_events (
  id       bigint generated always as identity primary key,
  org_id   uuid not null references organizations (id) on delete cascade,
  level    text not null check (level in ('info', 'warn', 'error')),
  source   text not null,           -- e.g. 'login', 'cron.sync', 'route.export-bpf'
  message  text not null,
  detail   text,
  at       timestamptz not null default now()
);
create index if not exists ops_events_org_at_idx on ops_events (org_id, at desc);
create index if not exists ops_events_org_level_idx on ops_events (org_id, level, at desc);

alter table ops_events enable row level security;

-- Direction / coordinator read their organization's operational journal.
drop policy if exists ops_events_staff_read on ops_events;
create policy ops_events_staff_read on ops_events
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );
-- No client insert policy — entries are written server-side with the service role.

-- -----------------------------------------------------------------------------
-- 2) Rate limiting (public entry points)
-- -----------------------------------------------------------------------------
-- No org_id by design: rate limiting protects PRE-AUTHENTICATION entry points
-- (the login form) where no trusted tenant context exists; the counter is keyed
-- by client identifier (IP) inside a named bucket.
create table if not exists rate_limit_events (
  id      bigint generated always as identity primary key,
  bucket  text not null,            -- e.g. 'login', 'mirror'
  key     text not null,            -- client identifier (IP) or other subject
  at      timestamptz not null default now()
);
create index if not exists rate_limit_events_lookup_idx on rate_limit_events (bucket, key, at);

alter table rate_limit_events enable row level security;
-- Intentionally NO policy: RLS enabled + no policy = anon/authenticated are denied
-- every row and every write. The table is touched ONLY through rate_limit_touch()
-- (SECURITY DEFINER) and the service role — never directly by a client.

-- rate_limit_touch(): record a hit and report whether the (bucket, key) is still
-- within budget over a sliding window. Returns TRUE when allowed (count ≤ max),
-- FALSE when the limit is exceeded. Prunes its own stale rows as it goes.
create or replace function rate_limit_touch(
  p_bucket text,
  p_key text,
  p_window_seconds int,
  p_max int
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  -- Housekeeping: drop hits older than the window for this (bucket, key).
  delete from rate_limit_events
    where bucket = p_bucket and key = p_key
      and at < now() - make_interval(secs => greatest(p_window_seconds, 0));
  -- Record the current attempt.
  insert into rate_limit_events (bucket, key) values (p_bucket, p_key);
  -- Count attempts inside the window (including this one).
  select count(*) into v_count from rate_limit_events
    where bucket = p_bucket and key = p_key
      and at >= now() - make_interval(secs => greatest(p_window_seconds, 0));
  return v_count <= p_max;
end;
$$;
-- Server-side only (login action calls it with the service role). Not exposed to
-- anon/authenticated to avoid an arbitrary-write surface on the counter table.
-- NB: Supabase's default privileges grant EXECUTE on public functions directly to
-- anon/authenticated, so a plain `revoke from public` is NOT enough — revoke those
-- roles explicitly (same lesson as 0018/0019 for is_erased).
revoke execute on function rate_limit_touch(text, text, int, int) from anon, authenticated, public;
grant execute on function rate_limit_touch(text, text, int, int) to service_role;
-- =============================================================================
