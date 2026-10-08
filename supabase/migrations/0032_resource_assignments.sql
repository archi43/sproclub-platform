-- 0032 — Accès aux ressources (INC-30).
--
-- Chaque apprenant doit retrouver dans la plateforme les accès techniques qui
-- lui sont affectés (serveur SAP, Learning Hub, BTP…) et leur mot de passe. Le
-- back office les tient dans Airtable : `Affectation ressources` relie une
-- commande à un compte de la table `Ressources`, pour une période donnée.
--
-- Décision de sécurité : **le mot de passe n'est PAS stocké ici.** La table ne
-- reflète que l'affectation (quel compte, quel type, quelle période). Le secret
-- est lu à la demande dans Airtable, côté serveur, par l'apprenant propriétaire
-- et pendant la période de validité seulement (`resource-rules.ts`), puis
-- journalisé dans `audit_log`. Copier les mots de passe dans Postgres aurait
-- doublé la surface d'exposition (sauvegardes, exports, réplicas) et créé une
-- seconde vérité qui dérive dès qu'un mot de passe change dans le back office.
--
-- La table est produite **entièrement** par la synchronisation : aucune policy
-- d'écriture, le client service-role seul y écrit. Elle peut donc refléter les
-- suppressions de la source sans risque de couper ce qu'elle n'a pas créé.

create table if not exists resource_assignments (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references organizations (id) on delete cascade,
  enrollment_id          uuid not null references enrollments_ro (id) on delete cascade,
  -- recordID de la ligne `Affectation ressources` : clé d'idempotence.
  airtable_record_id     text not null,
  -- recordID du compte dans `Ressources` : sert à lire le mot de passe à la demande.
  airtable_resource_id   text not null,
  -- Identifiant de connexion (champ « Ressource » d'Airtable), pas un secret.
  resource_label         text not null,
  resource_type          text,
  resource_category      text,
  starts_on              date,
  ends_on                date,
  synced_at              timestamptz not null default now(),
  -- Une affectation Airtable peut lier plusieurs comptes : une ligne par couple.
  -- Index NON partiel : seule forme acceptée comme cible d'un `on conflict` (cf. 0030).
  unique (org_id, airtable_record_id, airtable_resource_id)
);

comment on table resource_assignments is
  'Reflet des affectations de ressources du back office (INC-30). Aucun mot de '
  'passe : il est lu à la demande dans Airtable par l''apprenant propriétaire.';

create index if not exists resource_assignments_org_idx on resource_assignments (org_id);
create index if not exists resource_assignments_enrollment_idx on resource_assignments (enrollment_id);

alter table resource_assignments enable row level security;

-- L'apprenant lit les affectations de SES dossiers (même jointure que
-- `deliverables_student_manage`, 0004).
drop policy if exists resource_assignments_student_read on resource_assignments;
create policy resource_assignments_student_read on resource_assignments
  for select using (
    org_id = current_org_id() and is_member(org_id) and has_current_org_role('student')
    and enrollment_id in (
      select e.id from enrollments_ro e
      join learners_ro l on l.id = e.learner_id
      where e.org_id = current_org_id()
        and l.email = (select p.email from profiles p where p.id = auth.uid())
    )
  );

-- La coordination et la direction lisent toutes les affectations de l'organisme
-- (suivi des accès). Le coach n'en a pas l'usage : il n'est pas inclus.
drop policy if exists resource_assignments_staff_read on resource_assignments;
create policy resource_assignments_staff_read on resource_assignments
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );

-- Aucune policy insert/update/delete : seul le service-role écrit.

-- -----------------------------------------------------------------------------
-- Révélation du mot de passe : la base est le garde, pas l'écran.
--
-- Le serveur ne peut obtenir l'identifiant Airtable du compte, nécessaire pour
-- lire le mot de passe, QUE par cette fonction. Elle vérifie, dans la même
-- transaction :
--   1. que l'appelant est apprenant dans l'organisme actif ;
--   2. que l'affectation porte sur l'un de SES dossiers (l'e-mail du profil,
--      comme `deliverables_student_manage`) — un compte cumulant les rôles
--      apprenant et coordination n'obtient pas pour autant le mot de passe d'un
--      autre apprenant, alors que la policy staff lui laisserait lire la ligne ;
--   3. que la date du jour (Europe/Paris) est dans la période, bornes incluses
--      — même définition que `assignmentStatus` dans `resource-rules.ts` ;
-- puis journalise la révélation dans `audit_log` avant de rendre l'identifiant.
-- Refus = aucune ligne rendue, et rien n'est journalisé.
-- -----------------------------------------------------------------------------
create or replace function reveal_resource_assignment(p_assignment uuid)
returns table (airtable_resource_id text, resource_label text)
language plpgsql security definer set search_path = public as $$
declare
  v_org     uuid := current_org_id();
  v_today   date := (now() at time zone 'Europe/Paris')::date;
  v_learner uuid;
  v_res     text;
  v_label   text;
  v_start   date;
  v_end     date;
begin
  if v_org is null or not is_member(v_org) or not has_current_org_role('student') then
    return;
  end if;

  select ra.airtable_resource_id, ra.resource_label, ra.starts_on, ra.ends_on, l.id
    into v_res, v_label, v_start, v_end, v_learner
  from resource_assignments ra
  join enrollments_ro e on e.id = ra.enrollment_id and e.org_id = ra.org_id
  join learners_ro l on l.id = e.learner_id and l.org_id = e.org_id
  where ra.id = p_assignment
    and ra.org_id = v_org
    and l.email = (select p.email from profiles p where p.id = auth.uid());

  if v_res is null then
    return;
  end if;
  if (v_start is not null and v_today < v_start) or (v_end is not null and v_today > v_end) then
    return;
  end if;

  insert into audit_log (org_id, actor_id, action, subject_type, subject_id, detail)
  values (v_org, auth.uid(), 'resource.password_reveal', 'learner', v_learner, 'Ressource ' || v_label);

  return query select v_res, v_label;
end;
$$;

-- Verrou EXECUTE (piège de 0019) : Supabase accorde par défaut l'exécution à
-- `anon` et `authenticated` ; `revoke from public` ne suffit pas.
revoke all on function reveal_resource_assignment(uuid) from public, anon, authenticated;
grant execute on function reveal_resource_assignment(uuid) to authenticated;
