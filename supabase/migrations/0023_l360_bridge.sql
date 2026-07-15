-- =============================================================================
-- SproCLUB platform — INC-15: pont 360Learning (livrables de projet)
-- Addendum to 0001 → 0022.
--
-- Décision : le dépôt et la validation des livrables restent DANS 360Learning
-- (l'apprenant dépose, le JURY évalue et valide — le déblocage du projet suivant
-- est une mécanique interne aux parcours 360L). La plateforme se synchronise en
-- lecture (cron horaire) et reflète deux signaux distincts dans
-- project_deliverables :
--   - dépôt   : tentative clôturée sur le cours de rendu → deliverable_submitted
--               (débloque la réservation de soutenance, trigger 0004) ;
--   - validation jury : parcours 360L "successful" → validated_at + l360_score.
--
--   1. `l360_path_mappings` — correspondance parcours 360L → n° de projet.
--      Auto-découverte par la sync (nom « Projet n°X »), ajustable par le staff
--      (service-role) ; lecture direction/coordinator via RLS.
--   2. `project_deliverables` — colonnes `source` (traçabilité, même patron que
--      coaching_reports en 0022), `validated_at`, `l360_score`.
--
-- English identifiers, French user-facing text. Run AFTER 0022.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Correspondance parcours 360L → projet
-- -----------------------------------------------------------------------------
create table if not exists l360_path_mappings (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations (id) on delete cascade,
  l360_path_id      text not null,
  project_number    int  not null check (project_number > 0),
  deposit_course_id text,                       -- dernier cours du parcours = cours de rendu
  path_name         text,                       -- informatif (nom 360L au moment de la découverte)
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (org_id, l360_path_id)                 -- idempotence de l'auto-découverte
);
create index if not exists l360_path_mappings_org_idx on l360_path_mappings (org_id, active);

alter table l360_path_mappings enable row level security;

drop policy if exists l360_path_mappings_staff_read on l360_path_mappings;
create policy l360_path_mappings_staff_read on l360_path_mappings
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );
-- No client write policy — discovery/adjustments run server-side (service role).

-- -----------------------------------------------------------------------------
-- 2) project_deliverables : source tracée + validation jury
-- -----------------------------------------------------------------------------
alter table project_deliverables
  add column if not exists source text not null default 'platform'
    check (source in ('platform', 'l360')),
  add column if not exists validated_at timestamptz,   -- validation par le JURY (parcours 360L "successful")
  add column if not exists l360_score int check (l360_score between 0 and 100);

-- -----------------------------------------------------------------------------
-- 3) Garde-fou serveur : une ligne gérée par 360L ou déjà validée par le jury
--    n'est modifiable que par le service role (la sync). La policy student
--    (`deliverables_student_manage`, 0004) reste nécessaire pour les dépôts
--    manuels par URL, mais elle ne doit jamais permettre de réécrire un
--    livrable validé — la RLS/DB est le garde-fou, pas le filtre d'écran.
-- -----------------------------------------------------------------------------
create or replace function protect_l360_deliverable() returns trigger
language plpgsql as $$
begin
  if (old.source = 'l360' or old.validated_at is not null)
     and current_user in ('anon', 'authenticated') then
    raise exception 'Livrable géré par 360Learning ou déjà validé par le jury : modification refusée.';
  end if;
  return new;
end $$;

drop trigger if exists project_deliverables_protect_l360 on project_deliverables;
create trigger project_deliverables_protect_l360
  before update on project_deliverables
  for each row execute function protect_l360_deliverable();
-- =============================================================================
