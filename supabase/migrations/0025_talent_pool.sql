-- =============================================================================
-- SproCLUB platform — INC-17: vivier de talents pour entreprises partenaires
-- Addendum to 0001 → 0024 (requiert la valeur d'enum 'partner' ajoutée en 0024).
--
-- Décisions produit (validées) :
--   - NOMINATIF AVEC CONSENTEMENT : un candidat n'apparaît aux partenaires que
--     s'il a donné un consentement explicite, tracé et révocable ;
--   - SYNTHÈSE CHIFFRÉE uniquement (progression, projets validés, note moyenne
--     jury, assiduité) — jamais les commentaires internes coachs/jurys ;
--   - DISPONIBILITÉ double : statut posé par la coordination (prioritaire) +
--     déclaratif apprenant (date, contrat recherché, mobilité).
--
--   1. `partner_companies` — les entreprises partenaires (staff gère).
--   2. `memberships.partner_company_id` — rattachement d'un compte partner.
--   3. `talent_profiles` — consentement + disponibilité par apprenant :
--      l'apprenant gère SA ligne (RLS), le staff gère le statut vivier
--      (`staff_status`, verrouillé par trigger contre l'apprenant).
--   4. Vue `talent_pool` — SEULE surface lisible par les partenaires : colonnes
--      vérifiées, consentis uniquement, org courante, effacés RGPD exclus.
--      (Vue « owner » volontairement : les partenaires n'ont AUCUN accès aux
--      tables sous-jacentes ; le garde-fou est la clause WHERE + les grants.)
--
-- English identifiers, French user-facing text. Run AFTER 0024.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Entreprises partenaires
-- -----------------------------------------------------------------------------
create table if not exists partner_companies (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations (id) on delete cascade,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);
create index if not exists partner_companies_org_idx on partner_companies (org_id, active);

-- Rattachement des comptes partenaires (déclaré AVANT les policies qui le
-- référencent — l'ordre compte dans une même migration).
alter table memberships
  add column if not exists partner_company_id uuid references partner_companies (id) on delete set null;

alter table partner_companies enable row level security;

drop policy if exists partner_companies_staff_manage on partner_companies;
create policy partner_companies_staff_manage on partner_companies
  for all using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  ) with check (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );

-- Un partenaire lit SA société (nom affiché dans son portail), rien d'autre.
drop policy if exists partner_companies_partner_read on partner_companies;
create policy partner_companies_partner_read on partner_companies
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and exists (
      select 1 from memberships m
      where m.profile_id = auth.uid()
        and m.org_id = partner_companies.org_id
        and m.partner_company_id = partner_companies.id
        and m.deactivated_at is null
    )
  );

-- -----------------------------------------------------------------------------
-- 2) Cohérence du rattachement des comptes partenaires
-- -----------------------------------------------------------------------------
-- Cohérence de tenant au niveau base (revue sécurité INC-17) : une société de
-- rattachement doit appartenir au MÊME organisme que le membership, et n'a de
-- sens que sur un rôle partner — même patron que enforce_reservation_org (0004).
create or replace function enforce_partner_company_org() returns trigger
language plpgsql as $$
begin
  if new.partner_company_id is not null then
    if new.role <> 'partner' then
      raise exception 'partner_company_id est réservé au rôle partner.';
    end if;
    if not exists (
      select 1 from partner_companies pc
      where pc.id = new.partner_company_id and pc.org_id = new.org_id
    ) then
      raise exception 'La société de rattachement doit appartenir au même organisme.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists memberships_partner_company_org on memberships;
create trigger memberships_partner_company_org
  before insert or update on memberships
  for each row execute function enforce_partner_company_org();

-- -----------------------------------------------------------------------------
-- 3) Profil vivier : consentement (apprenant) + disponibilité (double)
-- -----------------------------------------------------------------------------
create table if not exists talent_profiles (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations (id) on delete cascade,
  learner_id      uuid not null references learners_ro (id) on delete cascade,
  consented_at    timestamptz,           -- consentement explicite de l'apprenant
  revoked_at      timestamptz,           -- révocation (toujours possible)
  available_from  date,                  -- déclaratif apprenant
  contract_sought text,                  -- déclaratif apprenant (CDI, mission, alternance…)
  mobility        text,                  -- déclaratif apprenant (remote, IDF, …)
  staff_status    text check (staff_status in ('searching', 'employed', 'unavailable')),
  updated_at      timestamptz not null default now(),
  unique (org_id, learner_id)
);
create index if not exists talent_profiles_org_idx on talent_profiles (org_id);

alter table talent_profiles enable row level security;

-- L'apprenant gère SA ligne (consentement + déclaratif). Même patron d'identité
-- que deliverables_student_manage (0004) : e-mail du profil = e-mail apprenant.
drop policy if exists talent_profiles_student_manage on talent_profiles;
create policy talent_profiles_student_manage on talent_profiles
  for all using (
    org_id = current_org_id() and is_member(org_id) and has_current_org_role('student')
    and learner_id in (
      select l.id from learners_ro l
      where l.org_id = current_org_id()
        and l.email = (select p.email from profiles p where p.id = auth.uid())
    )
  ) with check (
    org_id = current_org_id() and is_member(org_id) and has_current_org_role('student')
    and learner_id in (
      select l.id from learners_ro l
      where l.org_id = current_org_id()
        and l.email = (select p.email from profiles p where p.id = auth.uid())
    )
  );

-- La coordination lit tout et gère le statut vivier.
drop policy if exists talent_profiles_staff_manage on talent_profiles;
create policy talent_profiles_staff_manage on talent_profiles
  for all using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  ) with check (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );
-- Pas de policy partner : les partenaires ne touchent JAMAIS la table, ils
-- lisent la vue talent_pool.

-- `staff_status` n'appartient qu'à la coordination : un apprenant (rôle student,
-- via sa policy) ne peut ni le poser ni le modifier. Garde-fou serveur (trigger),
-- pas un simple oubli d'UI.
create or replace function protect_talent_staff_status() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated')
     and not (has_current_org_role('direction') or has_current_org_role('coordinator')) then
    if (tg_op = 'INSERT' and new.staff_status is not null)
       or (tg_op = 'UPDATE' and new.staff_status is distinct from old.staff_status) then
      raise exception 'Seule la coordination peut modifier le statut vivier.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists talent_profiles_protect_staff_status on talent_profiles;
create trigger talent_profiles_protect_staff_status
  before insert or update on talent_profiles
  for each row execute function protect_talent_staff_status();

-- -----------------------------------------------------------------------------
-- 4) Vue partenaire : la SEULE surface exposée au rôle partner
-- -----------------------------------------------------------------------------
-- Vue « owner » (bypass RLS des tables sous-jacentes) : c'est voulu — les
-- partenaires n'ont aucune policy sur learners_ro/enrollments_ro/etc. Les
-- garde-fous sont DANS la vue : consentement actif, org courante via les
-- helpers (qui lisent auth.uid()), effacés RGPD exclus, colonnes vérifiées
-- (synthèse chiffrée, jamais les corps de comptes rendus).
create or replace view talent_pool as
select
  tp.org_id,
  tp.learner_id,
  l.first_name,
  l.last_name,
  tp.consented_at,
  tp.available_from,
  tp.contract_sought,
  tp.mobility,
  tp.staff_status,
  e.id                   as enrollment_id,
  e.program,
  e.specialty,
  e.status               as enrollment_status,
  e.progress,
  e.projects_validated,
  e.projects_required,
  e.late_days,
  e.start_date,
  e.end_date,
  j.jury_avg_score,
  j.jury_validated_count,
  j.last_jury_validation_at
from talent_profiles tp
join learners_ro l on l.id = tp.learner_id
left join lateral (
  select e.*
  from enrollments_ro e
  where e.learner_id = tp.learner_id and e.org_id = tp.org_id
  order by e.start_date desc nulls last
  limit 1
) e on true
left join lateral (
  select
    round(avg(pd.l360_score)::numeric, 1) as jury_avg_score,
    count(*) filter (where pd.validated_at is not null) as jury_validated_count,
    max(pd.validated_at) as last_jury_validation_at
  from project_deliverables pd
  where pd.enrollment_id = e.id
) j on true
where tp.consented_at is not null
  and tp.revoked_at is null
  and not exists (
    select 1 from data_erasures d
    where d.org_id = tp.org_id and d.learner_email = l.email
  )
  and tp.org_id = current_org_id()
  and is_member(tp.org_id)
  and (
    -- Un accès partner n'est valable QUE porté par un membership actif rattaché
    -- à une société (défense en profondeur : le rôle seul ne suffit pas —
    -- l'accountability RGPD exige de savoir QUELLE entreprise regarde).
    exists (
      select 1 from memberships m2
      where m2.profile_id = auth.uid()
        and m2.org_id = tp.org_id
        and m2.role = 'partner'
        and m2.partner_company_id is not null
        and m2.deactivated_at is null
    )
    or has_current_org_role('direction')
    or has_current_org_role('coordinator')
  );

-- Grants stricts (0011 pose des defaults larges ; 0019 nous a appris à révoquer
-- explicitement) : jamais anon, lecture seule pour authenticated.
revoke all on talent_pool from public, anon;
grant select on talent_pool to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5) Moindre privilège : l'arrivée du rôle partner resserre les policies
--    « tout membre » existantes. `availabilities_read` (0004) ouvrait les
--    créneaux Cal.eu à tout membre de l'org — un partenaire n'a rien à y voir.
--    Liste blanche explicite des rôles qui participent à la réservation.
-- -----------------------------------------------------------------------------
drop policy if exists availabilities_read on availabilities;
create policy availabilities_read on availabilities
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (
      has_current_org_role('direction') or has_current_org_role('coordinator')
      or has_current_org_role('coach') or has_current_org_role('evaluator')
      or has_current_org_role('student')
    )
  );

-- `profiles_org_read` (0006) ouvrait TOUS les profils (e-mail, nom) à tout
-- co-membre via shares_org_with() — inacceptable dès qu'un rôle EXTERNE existe :
-- un partenaire lirait l'annuaire complet, apprenants compris (violation du
-- modèle « jamais l'e-mail »). Liste blanche des rôles internes ; un compte
-- purement partner ne lit que SON profil (profiles_self_read, 0006).
drop policy if exists profiles_org_read on profiles;
create policy profiles_org_read on profiles
  for select using (
    shares_org_with(id)
    and (
      has_current_org_role('direction') or has_current_org_role('coordinator')
      or has_current_org_role('coach') or has_current_org_role('evaluator')
      or has_current_org_role('student')
    )
  );

-- -----------------------------------------------------------------------------
-- 6) Accountability RGPD : journaliser les consultations du vivier.
--    log_access (0017) n'acceptait que les actions dossier.* du staff — on
--    étend la liste blanche à `talent_pool.view`, ouverte AUSSI au rôle partner
--    (c'est précisément l'accès de tiers qu'il faut tracer). Le reste est
--    inchangé : acteur/org dérivés de la session, jamais forgeables.
-- -----------------------------------------------------------------------------
create or replace function log_access(
  p_action text,
  p_subject_type text,
  p_subject_id uuid,
  p_detail text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := current_org_id();
begin
  if v_org is null or not is_member(v_org) then
    return; -- no active membership → nothing to log (fail-closed, no error)
  end if;
  if p_action in ('dossier.view', 'dossier.export', 'dossier.erase') then
    if not (has_current_org_role('direction') or has_current_org_role('coordinator')) then
      return;
    end if;
  elsif p_action = 'talent_pool.view' then
    if not (
      has_current_org_role('partner')
      or has_current_org_role('direction')
      or has_current_org_role('coordinator')
    ) then
      return;
    end if;
  else
    return;
  end if;
  insert into audit_log (org_id, actor_id, action, subject_type, subject_id, detail)
  values (v_org, auth.uid(), p_action, p_subject_type, p_subject_id, p_detail);
end;
$$;
-- =============================================================================
