-- 0031 — Provenance des memberships (INC-29).
--
-- Airtable devient la **seule surface de saisie** des identités et des rôles :
-- `Contacts` + `Habilitations` décident qui a un compte et avec quel rôle, la
-- plateforme s'y conforme. Deux conséquences à inscrire dans le schéma.
--
-- 1) Il faut distinguer ce que la synchronisation possède de ce qu'elle doit
--    laisser tranquille. Sans cette distinction, le premier passage désactiverait
--    les comptes de service (dont celui de la direction, absent d'Airtable) parce
--    qu'aucune habilitation ne les désigne : la plateforme se verrouillerait
--    elle-même dehors.
--
-- 2) Un compte issu d'Airtable ne doit plus être modifiable à la main, sinon la
--    source de vérité redevient double et la divergence est garantie. C'est la
--    RLS qui le refuse, pas l'écran : un garde d'affichage ne prouve rien.
--
-- Rappel utile pour la suite : le trigger `trg_last_direction` (0012) interdit
-- DÉJÀ, service-role inclus, de retirer le dernier compte de direction actif. La
-- synchronisation doit donc écarter ce cas en amont (`decideAccessSync`) plutôt
-- que de provoquer une exception à chaque passage.

-- -----------------------------------------------------------------------------
-- 1) Provenance
-- -----------------------------------------------------------------------------
alter table memberships
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'airtable')),
  add column if not exists airtable_habilitation_id text;

comment on column memberships.source is
  'Qui possède cette ligne : ''airtable'' = reflet d''une habilitation du back office, '
  'géré par la synchronisation et non modifiable à la main ; ''manual'' = compte de '
  'service créé dans la plateforme, hors périmètre de la synchronisation.';

comment on column memberships.airtable_habilitation_id is
  'recordID de l''habilitation Airtable dont cette ligne est le reflet. Porte '
  'l''idempotence du rapprochement.';

-- Idempotence du rapprochement : une habilitation ne peut se refléter qu'une
-- fois par organisme. Index NON partiel à dessein — un index partiel ne peut pas
-- être cible d'un `on conflict`, piège qui a coûté la migration corrective 0030.
-- Postgres traitant déjà les NULL comme distincts, les lignes manuelles (qui
-- portent NULL) ne se gênent pas entre elles.
create unique index if not exists memberships_airtable_habilitation_key
  on memberships (org_id, airtable_habilitation_id);

-- Lecture de la provenance par l'écran Administration : déjà couverte par
-- `membership_staff_read` (0012), qui porte sur la ligne entière.

-- -----------------------------------------------------------------------------
-- 2) Les lignes issues d'Airtable ne se modifient plus à la main.
--
--    `membership_manage` (0012) autorisait direction et coordination à écrire sur
--    toute ligne de l'organisme. On y ajoute la condition de provenance, dans le
--    `using` ET le `with check` : le premier interdit de toucher une ligne
--    existante issue d'Airtable, le second interdit d'en fabriquer une à la main
--    (sans quoi un coordinateur pourrait créer une ligne marquée 'airtable' et
--    se rendre lui-même intouchable).
--
--    La synchronisation, elle, passe par le client service-role, qui ne traverse
--    pas les policies. La RLS borne donc les humains, pas le cron.
-- -----------------------------------------------------------------------------
drop policy if exists membership_manage on memberships;
create policy membership_manage on memberships
  for all
  using (
    org_id = current_org_id() and is_member(org_id)
    and source = 'manual'
    and (
      has_current_org_role('direction')
      or (has_current_org_role('coordinator') and role <> 'direction')
    )
  )
  with check (
    org_id = current_org_id() and is_member(org_id)
    and source = 'manual'
    and (
      has_current_org_role('direction')
      or (has_current_org_role('coordinator') and role <> 'direction')
    )
  );

-- -----------------------------------------------------------------------------
-- 3) Journal du rapprochement, pour que la décision reste justifiable.
--
--    Auditabilité : « pourquoi cette personne a-t-elle perdu son accès le 12
--    mars ? ». La formule Airtable `Effectif` répond au présent (elle s'appuie
--    sur TODAY()) et ne se rejoue pas. On conserve donc ici ce que la
--    synchronisation a décidé, et sur quelle habilitation elle s'est appuyée.
--
--    Écrit par le service-role uniquement, lu par le staff de l'organisme.
-- -----------------------------------------------------------------------------
create table if not exists access_sync_log (
  id       bigint generated always as identity primary key,
  org_id   uuid not null references organizations (id) on delete cascade,
  action   text not null check (action in ('create', 'grant', 'reactivate', 'deactivate', 'skip')),
  email    text not null,
  role     text not null,
  airtable_habilitation_id text,
  reason   text,                      -- ce qui a fondé la décision
  at       timestamptz not null default now()
);
create index if not exists access_sync_log_org_at_idx on access_sync_log (org_id, at desc);

alter table access_sync_log enable row level security;

-- Lecture réservée au staff de l'organisme actif : le journal nomme des
-- personnes, il n'a rien à faire devant un apprenant ou un partenaire.
drop policy if exists access_sync_log_staff_read on access_sync_log;
create policy access_sync_log_staff_read on access_sync_log
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );

-- Aucune policy d'écriture : seul le service-role insère (comme `ops_events`,
-- 0020). Une trace que son sujet peut réécrire ne vaut rien.
