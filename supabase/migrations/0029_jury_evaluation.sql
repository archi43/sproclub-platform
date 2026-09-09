-- 0029 — Notation par le jury (INC-28).
--
-- Jusqu'ici le rôle `evaluator` n'avait aucune surface d'évaluation : les notes
-- arrivaient toutes par Fillout (1 487 sur 1 488). Cette migration ouvre au jury
-- le droit de noter DANS la plateforme, et resserre au passage ce qu'il voit.
--
-- Principe : un évaluateur n'existe qu'à travers ses affectations. Il ne voit et
-- ne note que les soutenances où la coordination l'a placé — jamais l'organisme
-- entier.

-- -----------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER pour traverser la RLS de `reservation_evaluators`
-- sans exiger que l'appelant puisse la lire lui-même.
-- -----------------------------------------------------------------------------
create or replace function is_evaluator_of_reservation(p_reservation uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from reservation_evaluators re
    where re.reservation_id = p_reservation
      and re.evaluator_id = auth.uid()
  );
$$;

/* Un évaluateur est rattaché à un dossier UNIQUEMENT via une soutenance où il
   siège. Passer par le dossier (et non la réservation) permet de borner la
   lecture de l'apprenant et de l'inscription au strict nécessaire. */
create or replace function is_evaluator_of_enrollment(p_enrollment uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from reservation_evaluators re
    join reservations r on r.id = re.reservation_id
    where re.evaluator_id = auth.uid()
      and r.enrollment_id = p_enrollment
      and r.kind = 'defense'
  );
$$;

create or replace function is_evaluator_of_learner(p_learner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from reservation_evaluators re
    join reservations r on r.id = re.reservation_id
    where re.evaluator_id = auth.uid()
      and r.learner_id = p_learner
      and r.kind = 'defense'
  );
$$;

-- Verrou d'exécution (piège relevé en 0019) : Supabase accorde EXECUTE à
-- `public` par défaut, ce qui inclut `anon`. Sans cette révocation, ces
-- fonctions seraient appelables sans session.
revoke all on function is_evaluator_of_reservation(uuid) from public, anon, authenticated;
revoke all on function is_evaluator_of_enrollment(uuid)  from public, anon, authenticated;
revoke all on function is_evaluator_of_learner(uuid)     from public, anon, authenticated;
grant execute on function is_evaluator_of_reservation(uuid) to authenticated;
grant execute on function is_evaluator_of_enrollment(uuid)  to authenticated;
grant execute on function is_evaluator_of_learner(uuid)     to authenticated;

-- -----------------------------------------------------------------------------
-- Resserrement : un évaluateur lisait TOUTES les réservations de l'organisme,
-- donc l'agenda de coaching de chaque apprenant. Il n'en a jamais eu besoin :
-- son portail ne montrait que ses disponibilités. On le borne à ses affectations.
-- -----------------------------------------------------------------------------
drop policy if exists reservations_staff_read on reservations;
create policy reservations_staff_read on reservations
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (
      has_current_org_role('direction')
      or has_current_org_role('coordinator')
      or (has_current_org_role('coach') and is_coach_of_enrollment(enrollment_id))
      or (has_current_org_role('evaluator') and is_evaluator_of_reservation(id))
    )
  );

-- -----------------------------------------------------------------------------
-- Ouverture minimale : le jury doit pouvoir nommer l'apprenant qu'il évalue et
-- situer son parcours. Strictement borné aux dossiers de ses soutenances.
-- -----------------------------------------------------------------------------
drop policy if exists enrollments_evaluator_read on enrollments_ro;
create policy enrollments_evaluator_read on enrollments_ro
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and has_current_org_role('evaluator')
    and is_evaluator_of_enrollment(id)
  );

drop policy if exists learners_evaluator_read on learners_ro;
create policy learners_evaluator_read on learners_ro
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and has_current_org_role('evaluator')
    and is_evaluator_of_learner(id)
  );

-- -----------------------------------------------------------------------------
-- Notation. Un évaluateur écrit ses propres comptes rendus, sur les soutenances
-- où il siège, en signant de son nom. Il relit ce qu'il a écrit, jamais ce qu'un
-- autre membre du jury a écrit : deux appréciations doivent rester indépendantes.
-- -----------------------------------------------------------------------------
drop policy if exists coaching_reports_evaluator_manage on coaching_reports;
create policy coaching_reports_evaluator_manage on coaching_reports
  for all
  using (
    org_id = current_org_id() and is_member(org_id)
    and has_current_org_role('evaluator')
    and author_id = auth.uid()
    and reservation_id is not null
    and is_evaluator_of_reservation(reservation_id)
  )
  with check (
    org_id = current_org_id() and is_member(org_id)
    and has_current_org_role('evaluator')
    and author_id = auth.uid()
    and reservation_id is not null
    and is_evaluator_of_reservation(reservation_id)
    and is_evaluator_of_enrollment(enrollment_id)
  );

-- Un jury ne note qu'une fois par soutenance : la seconde saisie doit modifier
-- la première, pas s'y ajouter. Sans cela, un double clic créerait deux notes
-- et fausserait toute moyenne calculée en aval.
create unique index if not exists coaching_reports_one_per_evaluator_idx
  on coaching_reports (reservation_id, author_id)
  where reservation_id is not null;
