-- =============================================================================
-- SproCLUB platform — INC-19 : disponibilités déclarées par les coachs et le jury
-- Addendum to 0001 → 0026.
--
-- Problème résolu : jusqu'ici `availabilities` n'était alimentée QUE par le
-- miroir Cal.com (`0004`, préfixe `cal:`), depuis un compte hôte unique et
-- réservée en écriture à direction/coordinator. Un coach ne pouvait donc pas
-- publier ses créneaux, et le jury (rôle `evaluator`) n'avait aucune surface.
--
-- Décision produit (option « hybride ») :
--   - SAISIE NATIVE : chacun déclare ses plages récurrentes (`availability_rules`)
--     et ses exceptions ponctuelles (`availability_blocks`, ouvrir ou fermer) ;
--   - AGENDA EXTERNE EN LECTURE SEULE : chacun peut coller l'URL privée de son
--     agenda (`calendar_feeds`, format iCalendar) ; un job service-role en tire
--     les occupations (`busy_periods`) qui masquent les créneaux générés.
--   - Les créneaux concrets restent écrits dans `availabilities`, avec le
--     préfixe `self:` — le miroir Cal.com ne purge que `cal:%`, les deux sources
--     coexistent donc sans se marcher dessus.
--
-- Sécurité :
--   - `host_id = auth.uid()` : chacun ne gère QUE ses propres disponibilités
--     (profiles est un miroir 1:1 de auth.users) ; direction/coordinator gèrent
--     tout (une coordinatrice doit pouvoir corriger un créneau) ;
--   - l'URL d'agenda est un SECRET (qui l'a lit l'agenda entier) : `calendar_feeds`
--     n'est lisible que par son propriétaire — même le staff n'y accède pas —
--     et le job de synchronisation passe par le service-role.
--
-- English identifiers, French user-facing text. Run AFTER 0026.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Plages récurrentes hebdomadaires
-- -----------------------------------------------------------------------------
create table if not exists availability_rules (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations (id) on delete cascade,
  host_id      uuid not null references profiles (id) on delete cascade,
  kind         booking_kind not null,                  -- 'coaching' | 'defense'
  weekday      smallint not null check (weekday between 0 and 6),  -- 0 = dimanche (extract(dow))
  start_time   time not null,
  end_time     time not null,
  slot_minutes smallint not null default 60 check (slot_minutes between 15 and 480),
  valid_from   date,                                   -- null = depuis toujours
  valid_to     date,                                   -- null = sans fin
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_time > start_time),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
create index if not exists availability_rules_host_idx on availability_rules (org_id, host_id, kind, active);

alter table availability_rules enable row level security;

-- Chacun gère SES plages, et seulement s'il est coach ou évaluateur.
drop policy if exists availability_rules_own_manage on availability_rules;
create policy availability_rules_own_manage on availability_rules
  for all
  using (
    org_id = current_org_id() and is_member(org_id)
    and host_id = auth.uid()
    and (has_current_org_role('coach') or has_current_org_role('evaluator'))
  )
  with check (
    org_id = current_org_id() and is_member(org_id)
    and host_id = auth.uid()
    and (has_current_org_role('coach') or has_current_org_role('evaluator'))
  );

-- La coordination voit et corrige tout (elle pilote le planning).
drop policy if exists availability_rules_staff_manage on availability_rules;
create policy availability_rules_staff_manage on availability_rules
  for all
  using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  )
  with check (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );

-- -----------------------------------------------------------------------------
-- 2) Exceptions ponctuelles — ouvrir un créneau hors récurrence, ou fermer
--    (congés, indisponibilité). `closed` l'emporte toujours sur `open`.
-- -----------------------------------------------------------------------------
create table if not exists availability_blocks (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations (id) on delete cascade,
  host_id    uuid not null references profiles (id) on delete cascade,
  kind       booking_kind,                             -- null = tous les types
  effect     text not null check (effect in ('open', 'closed')),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  slot_minutes smallint not null default 60 check (slot_minutes between 15 and 480),
  reason     text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists availability_blocks_host_idx on availability_blocks (org_id, host_id, starts_at);

alter table availability_blocks enable row level security;

drop policy if exists availability_blocks_own_manage on availability_blocks;
create policy availability_blocks_own_manage on availability_blocks
  for all
  using (
    org_id = current_org_id() and is_member(org_id)
    and host_id = auth.uid()
    and (has_current_org_role('coach') or has_current_org_role('evaluator'))
  )
  with check (
    org_id = current_org_id() and is_member(org_id)
    and host_id = auth.uid()
    and (has_current_org_role('coach') or has_current_org_role('evaluator'))
  );

drop policy if exists availability_blocks_staff_manage on availability_blocks;
create policy availability_blocks_staff_manage on availability_blocks
  for all
  using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  )
  with check (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );

-- -----------------------------------------------------------------------------
-- 3) Agenda externe (iCalendar) — URL PRIVÉE, traitée comme un secret.
--    Lisible uniquement par son propriétaire ; le staff n'y a AUCUN accès.
-- -----------------------------------------------------------------------------
create table if not exists calendar_feeds (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations (id) on delete cascade,
  profile_id     uuid not null references profiles (id) on delete cascade,
  ics_url        text not null,
  active         boolean not null default true,
  last_synced_at timestamptz,
  last_status    text,                                  -- 'ok' | message d'erreur court
  event_count    integer,
  created_at     timestamptz not null default now(),
  unique (org_id, profile_id)
);

alter table calendar_feeds enable row level security;

-- Propriétaire uniquement — volontairement pas de policy staff : l'URL donne
-- accès à l'agenda personnel complet.
drop policy if exists calendar_feeds_own_manage on calendar_feeds;
create policy calendar_feeds_own_manage on calendar_feeds
  for all
  using (
    org_id = current_org_id() and is_member(org_id)
    and profile_id = auth.uid()
  )
  with check (
    org_id = current_org_id() and is_member(org_id)
    and profile_id = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- 4) Occupations importées de l'agenda externe. Écrites par le job service-role,
--    lues par le propriétaire (pour comprendre pourquoi un créneau a disparu)
--    et par la coordination (sans jamais exposer l'URL ni le détail privé).
-- -----------------------------------------------------------------------------
create table if not exists busy_periods (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations (id) on delete cascade,
  host_id      uuid not null references profiles (id) on delete cascade,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  source       text not null default 'ics',
  external_uid text,
  synced_at    timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (org_id, host_id, source, external_uid, starts_at)
);
create index if not exists busy_periods_host_idx on busy_periods (org_id, host_id, starts_at);

alter table busy_periods enable row level security;

drop policy if exists busy_periods_own_read on busy_periods;
create policy busy_periods_own_read on busy_periods
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and host_id = auth.uid()
  );

drop policy if exists busy_periods_staff_read on busy_periods;
create policy busy_periods_staff_read on busy_periods
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );

-- Écriture réservée au job de synchronisation (service-role) : aucune policy
-- d'insertion/mise à jour n'est déclarée, donc la RLS refuse tout le monde.

-- -----------------------------------------------------------------------------
-- 5) Les créneaux générés depuis les déclarations ci-dessus sont écrits dans
--    `availabilities` avec le préfixe `self:`. La policy d'écriture de 0004
--    réservait la table à direction/coordinator ; on l'étend au titulaire, qui
--    doit pouvoir publier ET retirer ses propres créneaux. Un créneau déjà
--    réservé reste protégé par la contrainte existante sur `reservations`.
-- -----------------------------------------------------------------------------
drop policy if exists availabilities_own_manage on availabilities;
create policy availabilities_own_manage on availabilities
  for all
  using (
    org_id = current_org_id() and is_member(org_id)
    and host_id = auth.uid()
    and (has_current_org_role('coach') or has_current_org_role('evaluator'))
  )
  with check (
    org_id = current_org_id() and is_member(org_id)
    and host_id = auth.uid()
    and (has_current_org_role('coach') or has_current_org_role('evaluator'))
  );
