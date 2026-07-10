-- =============================================================================
-- SproCLUB platform — Notifications & relances (INC-7)
-- Addendum to 0001 → 0020.
--
--   1. `notifications` — the send journal. Each due reminder is enqueued once
--      (idempotent via a unique dedupe_key), then dispatched by a cron. Statuses:
--      pending → sent | skipped | error. Written server-side (service role),
--      read by direction/coordinator via RLS.
--   2. `notification_prefs` — per-recipient opt-out, by kind. A row with
--      opted_out = true suppresses that kind for that e-mail.
--
-- Rétention : `notifications` contient nom/e-mail/objet en clair → purge à 90 j
-- par le cron purge-retention (INC-12), et effacement RGPD par eraseLearner.
--
-- English identifiers, French user-facing text. Run AFTER 0020.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Send journal
-- -----------------------------------------------------------------------------
create table if not exists notifications (
  id              bigint generated always as identity primary key,
  org_id          uuid not null references organizations (id) on delete cascade,
  kind            text not null,               -- e.g. 'defense_reminder', 'server_access_ending', 'report_pending'
  recipient_email text not null,
  subject         text not null,
  body            text not null,
  status          text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'error')),
  dedupe_key      text not null,               -- stable key: one notification per (kind, entity, period)
  scheduled_for   timestamptz not null default now(),
  sent_at         timestamptz,
  error           text,
  created_at      timestamptz not null default now(),
  unique (org_id, dedupe_key)                  -- idempotency: re-running the cron never duplicates
);
create index if not exists notifications_org_created_idx on notifications (org_id, created_at desc);
create index if not exists notifications_org_status_idx on notifications (org_id, status);

alter table notifications enable row level security;

drop policy if exists notifications_staff_read on notifications;
create policy notifications_staff_read on notifications
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );
-- No client write policy — enqueue/dispatch run server-side with the service role.

-- -----------------------------------------------------------------------------
-- 2) Recipient preferences (opt-out by kind)
-- -----------------------------------------------------------------------------
create table if not exists notification_prefs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  email         text not null check (email = lower(email)),
  kind          text not null,
  opted_out     boolean not null default true,
  updated_at    timestamptz not null default now(),
  unique (org_id, email, kind)
);
create index if not exists notification_prefs_org_email_idx on notification_prefs (org_id, email);

alter table notification_prefs enable row level security;

-- Direction / coordinator read and manage the preference register of their org.
drop policy if exists notification_prefs_staff_read on notification_prefs;
create policy notification_prefs_staff_read on notification_prefs
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );
drop policy if exists notification_prefs_staff_manage on notification_prefs;
create policy notification_prefs_staff_manage on notification_prefs
  for all using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  ) with check (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );
-- =============================================================================
