-- =============================================================================
-- SproCLUB platform — INC-18: jobboard (offres des entreprises partenaires)
-- Addendum to 0001 → 0025 (requiert le rôle 'partner' et partner_companies).
--
-- Décisions produit (validées) :
--   - MODÉRATION par la coordination : une offre du partenaire n'est visible
--     des apprenants qu'une fois `published` par la direction/coordination ;
--   - INTÉRÊT EN UN CLIC : l'apprenant marque son intérêt ; le partenaire voit
--     les candidats intéressés — MAIS seulement ceux qui ont consenti au vivier
--     (INC-17), en synthèse chiffrée. Réutilise exactement les garanties de
--     confidentialité déjà revues (jamais e-mail/commentaires).
--
--   1. `job_offers` — offres, avec cycle de modération (statut). Le partenaire
--      rédige/soumet ; seule la coordination publie/rejette (trigger).
--   2. `job_interests` — intérêt d'un apprenant pour une offre publiée.
--   3. Vue `job_offer_candidates` — SEULE surface où un partenaire voit QUI est
--      intéressé : intersection intérêt × consentement vivier, synthèse chiffrée.
--
-- English identifiers, French user-facing text. Run AFTER 0025.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Offres d'emploi (cycle de modération)
-- -----------------------------------------------------------------------------
create table if not exists job_offers (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations (id) on delete cascade,
  partner_company_id uuid not null references partner_companies (id) on delete cascade,
  title              text not null check (char_length(title) between 1 and 200),
  description        text not null check (char_length(description) between 1 and 5000),
  contract_type      text check (contract_type is null or char_length(contract_type) <= 60),
  location           text check (location is null or char_length(location) <= 120),
  remote             text check (remote is null or char_length(remote) <= 120),
  status             text not null default 'pending'
                       check (status in ('pending', 'published', 'rejected', 'archived')),
  moderation_note    text,                      -- motif de rejet (visible du partenaire)
  created_by         uuid references profiles (id) on delete set null,
  moderated_by       uuid references profiles (id) on delete set null,
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists job_offers_org_status_idx on job_offers (org_id, status);
create index if not exists job_offers_company_idx on job_offers (partner_company_id);

alter table job_offers enable row level security;

-- La société du partenaire connecté (helper local : un partner n'a qu'une
-- société de rattachement active).
create or replace function my_partner_company() returns uuid
language sql stable security definer set search_path = public as $$
  select m.partner_company_id
  from memberships m
  where m.profile_id = auth.uid()
    and m.org_id = current_org_id()
    and m.role = 'partner'
    and m.partner_company_id is not null
    and m.deactivated_at is null
  limit 1
$$;
-- revoke depuis public NE retire PAS le grant direct anon/authenticated posé par
-- les default privileges Supabase (leçon is_erased, 0018/0019) : révoquer nommément.
revoke execute on function my_partner_company() from public, anon, authenticated;
grant execute on function my_partner_company() to authenticated, service_role;

-- Cohérence de tenant (patron enforce_*_org de 0004) : une offre pointe une
-- société de SON organisme. La RLS partenaire l'impose déjà, mais la policy
-- staff pourrait sinon référencer une société d'un autre org.
create or replace function enforce_job_offer_company_org() returns trigger
language plpgsql as $$
begin
  if not exists (
    select 1 from partner_companies pc
    where pc.id = new.partner_company_id and pc.org_id = new.org_id
  ) then
    raise exception 'L''offre doit référencer une société du même organisme.';
  end if;
  return new;
end $$;

drop trigger if exists job_offers_company_org on job_offers;
create trigger job_offers_company_org
  before insert or update on job_offers
  for each row execute function enforce_job_offer_company_org();

-- Le partenaire lit / crée / met à jour les offres de SA société — mais JAMAIS
-- de DELETE (sinon supprimer une offre publiée effacerait en cascade les
-- job_interests, sans trace ni passage par la coordination). Le retrait passe
-- par la transition `archived` ; la suppression reste au staff/service-role.
drop policy if exists job_offers_partner_manage on job_offers;
drop policy if exists job_offers_partner_read on job_offers;
drop policy if exists job_offers_partner_insert on job_offers;
drop policy if exists job_offers_partner_update on job_offers;
create policy job_offers_partner_read on job_offers
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and has_current_org_role('partner') and partner_company_id = my_partner_company()
  );
create policy job_offers_partner_insert on job_offers
  for insert with check (
    org_id = current_org_id() and is_member(org_id)
    and has_current_org_role('partner') and partner_company_id = my_partner_company()
  );
create policy job_offers_partner_update on job_offers
  for update using (
    org_id = current_org_id() and is_member(org_id)
    and has_current_org_role('partner') and partner_company_id = my_partner_company()
  ) with check (
    org_id = current_org_id() and is_member(org_id)
    and has_current_org_role('partner') and partner_company_id = my_partner_company()
  );

-- La coordination lit tout et modère.
drop policy if exists job_offers_staff_manage on job_offers;
create policy job_offers_staff_manage on job_offers
  for all using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  ) with check (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );

-- L'apprenant lit UNIQUEMENT les offres publiées de son organisme.
drop policy if exists job_offers_student_read on job_offers;
create policy job_offers_student_read on job_offers
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and has_current_org_role('student')
    and status = 'published'
  );

-- Garde-fou serveur : le PARTENAIRE ne décide jamais de la publication. Il crée
-- en `pending`, peut re-soumettre une offre rejetée (rejected → pending) ou
-- archiver la sienne, mais ne peut pas se publier lui-même. Seule la
-- coordination (ou le service role) écrit `published`/`rejected`.
create or replace function protect_job_offer_moderation() returns trigger
language plpgsql as $$
declare is_staff boolean := has_current_org_role('direction') or has_current_org_role('coordinator');
begin
  if current_user not in ('anon', 'authenticated') then
    return new; -- service role (jobs de confiance)
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('pending') and not is_staff then
      raise exception 'Une nouvelle offre est soumise en modération (statut pending).';
    end if;
  elsif tg_op = 'UPDATE' and not is_staff then
    -- transitions de statut permises au partenaire : re-soumettre ou archiver.
    if new.status is distinct from old.status then
      if not ((old.status = 'rejected' and new.status = 'pending')
              or (new.status = 'archived')) then
        raise exception 'Seule la coordination peut publier ou rejeter une offre.';
      end if;
    end if;
    -- Toute édition de CONTENU d'une offre publiée la fait repasser en
    -- modération : le contenu validé par le staff ne peut être substitué en
    -- douce une fois visible des apprenants (garde-fou serveur, pas l'UI).
    if old.status = 'published' and (
         new.title         is distinct from old.title
      or new.description   is distinct from old.description
      or new.contract_type is distinct from old.contract_type
      or new.location      is distinct from old.location
      or new.remote        is distinct from old.remote
    ) then
      new.status := 'pending';
      new.published_at := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists job_offers_protect_moderation on job_offers;
create trigger job_offers_protect_moderation
  before insert or update on job_offers
  for each row execute function protect_job_offer_moderation();

-- -----------------------------------------------------------------------------
-- 2) Intérêt des apprenants (un clic)
-- -----------------------------------------------------------------------------
create table if not exists job_interests (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations (id) on delete cascade,
  job_offer_id uuid not null references job_offers (id) on delete cascade,
  learner_id   uuid not null references learners_ro (id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (job_offer_id, learner_id)
);
create index if not exists job_interests_offer_idx on job_interests (job_offer_id);
create index if not exists job_interests_learner_idx on job_interests (org_id, learner_id);

alter table job_interests enable row level security;

-- L'apprenant gère SON intérêt, uniquement sur une offre PUBLIÉE (même patron
-- d'identité que talent_profiles/deliverables : e-mail du profil = apprenant).
drop policy if exists job_interests_student_manage on job_interests;
create policy job_interests_student_manage on job_interests
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
    and job_offer_id in (select o.id from job_offers o where o.org_id = current_org_id() and o.status = 'published')
  );

-- La coordination lit tous les intérêts.
drop policy if exists job_interests_staff_read on job_interests;
create policy job_interests_staff_read on job_interests
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );
-- Pas de policy partner : le partenaire lit la vue job_offer_candidates.

-- -----------------------------------------------------------------------------
-- 3) Vue partenaire : candidats intéressés PAR une de ses offres
-- -----------------------------------------------------------------------------
-- Même modèle que talent_pool : vue « owner », garde-fous DANS la clause WHERE.
-- Un candidat n'apparaît QUE s'il a consenti au vivier (INC-17) — l'intérêt +
-- le consentement forment la base légale du partage nominatif. Synthèse
-- chiffrée uniquement, effacés RGPD exclus, org courante, société propriétaire
-- de l'offre. La coordination voit aussi (suivi).
create or replace view job_offer_candidates as
select
  ji.job_offer_id,
  o.partner_company_id,
  o.title,
  ji.created_at        as interested_at,
  tp.learner_id,
  l.first_name,
  l.last_name,
  tp.available_from,
  tp.contract_sought,
  tp.mobility,
  tp.staff_status,
  e.program,
  e.specialty,
  e.progress,
  e.projects_validated,
  e.projects_required,
  j.jury_avg_score,
  j.jury_validated_count
from job_interests ji
join job_offers o on o.id = ji.job_offer_id
join learners_ro l on l.id = ji.learner_id
join talent_profiles tp on tp.learner_id = ji.learner_id and tp.org_id = ji.org_id
left join lateral (
  select e.* from enrollments_ro e
  where e.learner_id = ji.learner_id and e.org_id = ji.org_id
  order by e.start_date desc nulls last limit 1
) e on true
left join lateral (
  select
    round(avg(pd.l360_score)::numeric, 1) as jury_avg_score,
    count(*) filter (where pd.validated_at is not null) as jury_validated_count
  from project_deliverables pd where pd.enrollment_id = e.id
) j on true
where tp.consented_at is not null
  and tp.revoked_at is null
  and not exists (
    select 1 from data_erasures d where d.org_id = ji.org_id and d.learner_email = l.email
  )
  and ji.org_id = current_org_id()
  and is_member(ji.org_id)
  and (
    (has_current_org_role('partner') and o.partner_company_id = my_partner_company())
    or has_current_org_role('direction')
    or has_current_org_role('coordinator')
  );

-- security_barrier : empêche un push-down de prédicat avant l'évaluation des
-- conditions de sécurité si la vue est étendue plus tard (défense en profondeur).
alter view job_offer_candidates set (security_barrier = true);
alter view talent_pool set (security_barrier = true); -- rétro-durcissement INC-17

revoke all on job_offer_candidates from public, anon;
grant select on job_offer_candidates to authenticated, service_role;

-- Accountability RGPD (patron talent_pool.view, 0025) : tracer la consultation
-- par un tiers des données nominatives des candidats d'une offre.
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
    return;
  end if;
  if p_action in ('dossier.view', 'dossier.export', 'dossier.erase') then
    if not (has_current_org_role('direction') or has_current_org_role('coordinator')) then
      return;
    end if;
  elsif p_action in ('talent_pool.view', 'job_offer_candidates.view') then
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

-- -----------------------------------------------------------------------------
-- 4) Besoins de formation exprimés par les entreprises (signal B2B → SproCLUB)
-- -----------------------------------------------------------------------------
-- Une entreprise partenaire exprime les compétences/profils qu'elle aimerait
-- voir formés. Ce n'est PAS une offre visible des apprenants : c'est un signal
-- de demande vers la coordination, pour orienter l'ingénierie de formation.
create table if not exists partner_training_needs (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations (id) on delete cascade,
  partner_company_id uuid not null references partner_companies (id) on delete cascade,
  title              text not null check (char_length(title) between 1 and 200), -- compétence / domaine visé
  description        text check (description is null or char_length(description) <= 5000),
  headcount          int check (headcount is null or (headcount > 0 and headcount <= 100000)),
  timeframe          text check (timeframe is null or char_length(timeframe) <= 120),
  status             text not null default 'open'
                       check (status in ('open', 'reviewed', 'closed')),
  created_by         uuid references profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists training_needs_org_status_idx on partner_training_needs (org_id, status);
create index if not exists training_needs_company_idx on partner_training_needs (partner_company_id);

alter table partner_training_needs enable row level security;

-- Le partenaire gère les besoins de SA société.
drop policy if exists training_needs_partner_manage on partner_training_needs;
create policy training_needs_partner_manage on partner_training_needs
  for all using (
    org_id = current_org_id() and is_member(org_id)
    and has_current_org_role('partner')
    and partner_company_id = my_partner_company()
  ) with check (
    org_id = current_org_id() and is_member(org_id)
    and has_current_org_role('partner')
    and partner_company_id = my_partner_company()
  );

-- La coordination lit tous les besoins et met à jour leur statut (suivi).
drop policy if exists training_needs_staff_manage on partner_training_needs;
create policy training_needs_staff_manage on partner_training_needs
  for all using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  ) with check (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );
-- Aucune surface apprenant : les besoins ne sont pas exposés au rôle student.

-- `status` (suivi interne) n'appartient qu'à la coordination : le partenaire
-- crée/édite le contenu mais ne pilote pas le statut de traitement. Garde-fou
-- serveur (même patron que talent_profiles.staff_status).
create or replace function protect_training_need_status() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated')
     and not (has_current_org_role('direction') or has_current_org_role('coordinator')) then
    if (tg_op = 'INSERT' and new.status <> 'open')
       or (tg_op = 'UPDATE' and new.status is distinct from old.status) then
      raise exception 'Seule la coordination met à jour le statut d''un besoin de formation.';
    end if;
    -- Éditer le contenu d'un besoin déjà traité le renvoie en file « open » :
    -- le suivi de la coordination ne porte jamais sur un contenu obsolète.
    if tg_op = 'UPDATE' and old.status <> 'open' and (
         new.title       is distinct from old.title
      or new.description is distinct from old.description
      or new.headcount   is distinct from old.headcount
      or new.timeframe   is distinct from old.timeframe
    ) then
      new.status := 'open';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists training_needs_protect_status on partner_training_needs;
create trigger training_needs_protect_status
  before insert or update on partner_training_needs
  for each row execute function protect_training_need_status();
-- =============================================================================
