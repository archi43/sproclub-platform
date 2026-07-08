-- =============================================================================
-- SproCLUB platform — multi-tenant layer (addendum to pilote_schema.sql)
-- Model: pooled (shared database) + Row Level Security by organization.
-- Every business row carries org_id; isolation is enforced server-side.
-- PostgreSQL / Supabase. English identifiers.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Organizations (tenants) and memberships
-- -----------------------------------------------------------------------------
create table organizations (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,                 -- e.g. 'sproclub'
  name          text not null,
  custom_domain text unique,                          -- e.g. 'intranet.sproclub.com'
  brand         jsonb not null default '{}'::jsonb,   -- logo, colors, labels (white-label)
  plan          text not null default 'standard',
  status        text not null default 'active',
  created_at    timestamptz not null default now()
);

-- A user (profiles.id = auth.users.id) can belong to several organizations,
-- with a role per organization. Replaces a global roles table.
create table memberships (
  org_id     uuid not null references organizations (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  role       app_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, profile_id, role)
);
create index on memberships (profile_id);

-- Per-organization integration config. Secrets are NOT stored here:
-- secret_ref points to an entry in the platform secret manager.
create table connector_configs (
  org_id     uuid not null references organizations (id) on delete cascade,
  kind       text not null,                           -- 'airtable', 'calcom', '360learning', ...
  config     jsonb not null default '{}'::jsonb,      -- non-secret settings (base id, table ids)
  secret_ref text,                                    -- reference to secret manager, never the secret
  enabled    boolean not null default false,
  primary key (org_id, kind)
);

-- -----------------------------------------------------------------------------
-- Tenant context helpers
-- The API sets app.current_org_id per request from the authenticated JWT.
-- -----------------------------------------------------------------------------
create or replace function current_org_id()
returns uuid language sql stable as $$
  select nullif(current_setting('app.current_org_id', true), '')::uuid;
$$;

create or replace function is_member(target_org uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from memberships m
    where m.profile_id = auth.uid() and m.org_id = target_org
  );
$$;

create or replace function has_org_role(target_org uuid, target app_role)
returns boolean language sql stable as $$
  select exists (
    select 1 from memberships m
    where m.profile_id = auth.uid() and m.org_id = target_org and m.role = target
  );
$$;

-- -----------------------------------------------------------------------------
-- Tenant scoping pattern for every business table
-- Example applied to the pilot tables from pilote_schema.sql.
-- Repeat for enrollments_ro, project_deliverables, availabilities,
-- reservations, evaluator_pool, sync_log, and any future table.
-- -----------------------------------------------------------------------------
alter table learners_ro   add column org_id uuid not null references organizations (id);
alter table enrollments_ro add column org_id uuid not null references organizations (id);
alter table reservations   add column org_id uuid not null references organizations (id);
create index on learners_ro (org_id);
create index on enrollments_ro (org_id);
create index on reservations (org_id);

alter table organizations    enable row level security;
alter table memberships      enable row level security;
alter table connector_configs enable row level security;

-- Users see only organizations they belong to.
create policy org_member_reads on organizations
  for select using (is_member(id));

-- Membership visible to members of the same organization.
create policy membership_same_org on memberships
  for select using (is_member(org_id));

-- Generic tenant isolation policy (example on enrollments_ro).
-- The row must belong to the current request's organization AND the user must
-- be a member of it. Combine with role checks (has_org_role) where needed.
create policy tenant_isolation_enrollments on enrollments_ro
  for select using (org_id = current_org_id() and is_member(org_id));

create policy tenant_isolation_reservations on reservations
  for all
  using (org_id = current_org_id() and is_member(org_id))
  with check (org_id = current_org_id() and is_member(org_id));

-- -----------------------------------------------------------------------------
-- Bootstrap: SproCLUB is simply the first organization. Airtable is enabled
-- only for it; other organizations run on Postgres alone or other connectors.
-- -----------------------------------------------------------------------------
-- insert into organizations (slug, name, custom_domain)
--   values ('sproclub', 'SproCLUB', 'intranet.sproclub.com');
-- insert into connector_configs (org_id, kind, config, secret_ref, enabled)
--   values ((select id from organizations where slug='sproclub'),
--           'airtable',
--           '{"baseId":"appHmDCjHyGyOK7hM"}'::jsonb,
--           'secret://sproclub/airtable_token',
--           true);
