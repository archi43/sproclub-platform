-- =============================================================================
-- SproCLUB platform — booking invariants (Étape 2, réservation)
-- Addendum to 0001 → 0003. Enforces the pilot's booking rules AT THE DATABASE
-- level so they cannot be bypassed by any client:
--   * "jury of two, never the referent coach" for defenses (soutenances)
--   * evaluators must belong to the program's evaluator pool
--   * a defense can only be booked once the project deliverable is submitted
--   * organization consistency across a reservation and its enrollment/learner
-- Also completes tenant scoping (org_id + RLS) for the booking tables that
-- 0001 left deny-all.
-- English identifiers. Run AFTER 0003.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tenant scoping for the remaining booking tables (all empty at pilot time,
--    so NOT NULL columns are safe to add directly).
-- -----------------------------------------------------------------------------
alter table availabilities       add column org_id uuid not null references organizations (id);
alter table project_deliverables add column org_id uuid not null references organizations (id);
alter table evaluator_pool       add column org_id uuid not null references organizations (id);
alter table reservation_evaluators add column org_id uuid not null references organizations (id);

create index on availabilities (org_id);
create index on project_deliverables (org_id);
create index on evaluator_pool (org_id);
create index on reservation_evaluators (org_id);

-- evaluator_pool had no RLS in 0001; enable it now.
alter table evaluator_pool enable row level security;

-- -----------------------------------------------------------------------------
-- 2) RLS policies (org-scoped). Students read slots and their own deliverables;
--    staff manage. RLS remains the authoritative server-side guard.
-- -----------------------------------------------------------------------------

-- Availabilities: any member of the org may read (students pick slots); only
-- staff may write (mirrored from Cal.com by a trusted server job).
drop policy if exists availabilities_read on availabilities;
create policy availabilities_read on availabilities
  for select using (org_id = current_org_id() and is_member(org_id));

drop policy if exists availabilities_staff_write on availabilities;
create policy availabilities_staff_write on availabilities
  for all
  using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  )
  with check (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );

-- Project deliverables: the student of the enrollment reads and submits their
-- own; staff read all in the org.
drop policy if exists deliverables_student_manage on project_deliverables;
create policy deliverables_student_manage on project_deliverables
  for all
  using (
    org_id = current_org_id() and is_member(org_id) and has_current_org_role('student')
    and enrollment_id in (
      select e.id from enrollments_ro e
      join learners_ro l on l.id = e.learner_id
      where e.org_id = current_org_id()
        and l.email = (select p.email from profiles p where p.id = auth.uid())
    )
  )
  with check (
    org_id = current_org_id() and is_member(org_id) and has_current_org_role('student')
    and enrollment_id in (
      select e.id from enrollments_ro e
      join learners_ro l on l.id = e.learner_id
      where e.org_id = current_org_id()
        and l.email = (select p.email from profiles p where p.id = auth.uid())
    )
  );

drop policy if exists deliverables_staff_read on project_deliverables;
create policy deliverables_staff_read on project_deliverables
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator') or has_current_org_role('coach'))
  );

-- Evaluator pool: staff read; direction/coordinator manage.
drop policy if exists evaluator_pool_read on evaluator_pool;
create policy evaluator_pool_read on evaluator_pool
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator')
         or has_current_org_role('coach') or has_current_org_role('evaluator'))
  );

drop policy if exists evaluator_pool_manage on evaluator_pool;
create policy evaluator_pool_manage on evaluator_pool
  for all
  using (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  )
  with check (
    org_id = current_org_id() and is_member(org_id)
    and (has_current_org_role('direction') or has_current_org_role('coordinator'))
  );

-- Reservation evaluators: the student reads the jury of their own reservation;
-- staff manage. Writes are additionally constrained by triggers below.
drop policy if exists reservation_evaluators_read on reservation_evaluators;
create policy reservation_evaluators_read on reservation_evaluators
  for select using (
    org_id = current_org_id() and is_member(org_id)
    and (
      has_current_org_role('direction') or has_current_org_role('coordinator')
      or has_current_org_role('coach') or has_current_org_role('evaluator')
      or reservation_id in (
        select r.id from reservations r
        join learners_ro l on l.id = r.learner_id
        where r.org_id = current_org_id()
          and l.email = (select p.email from profiles p where p.id = auth.uid())
      )
    )
  );

drop policy if exists reservation_evaluators_staff_write on reservation_evaluators;
create policy reservation_evaluators_staff_write on reservation_evaluators
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
-- 3) Organization consistency: a reservation must belong to the SAME org as its
--    enrollment and learner. Backfills org_id when omitted.
-- -----------------------------------------------------------------------------
create or replace function enforce_reservation_org_consistency()
returns trigger language plpgsql as $$
declare e_org uuid; l_org uuid;
begin
  select org_id into e_org from enrollments_ro where id = new.enrollment_id;
  select org_id into l_org from learners_ro   where id = new.learner_id;
  if new.org_id is null then new.org_id := e_org; end if;
  if e_org is null or new.org_id <> e_org or new.org_id <> l_org then
    raise exception 'Incohérence d''organisme entre la réservation, l''inscription et l''apprenant.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reservation_org on reservations;
create trigger trg_reservation_org
  before insert or update on reservations
  for each row execute function enforce_reservation_org_consistency();

-- -----------------------------------------------------------------------------
-- 4) Deliverable gating: a defense can only be booked once the matching project
--    deliverable is submitted.
-- -----------------------------------------------------------------------------
create or replace function enforce_defense_deliverable_gate()
returns trigger language plpgsql as $$
declare submitted boolean;
begin
  if new.kind = 'defense' then
    select deliverable_submitted into submitted
      from project_deliverables
      where enrollment_id = new.enrollment_id and project_number = new.project_number;
    if submitted is distinct from true then
      raise exception 'Le livrable du projet % doit être déposé avant de réserver la soutenance.', new.project_number
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_defense_deliverable_gate on reservations;
create trigger trg_defense_deliverable_gate
  before insert on reservations
  for each row execute function enforce_defense_deliverable_gate();

-- -----------------------------------------------------------------------------
-- 5) Evaluator rules on insert into a jury:
--    * never the referent coach of the enrollment
--    * must belong to the program's evaluator pool (same org)
--    * at most two evaluators per reservation
-- -----------------------------------------------------------------------------
create or replace function enforce_evaluator_rules()
returns trigger language plpgsql as $$
declare
  v_enrollment uuid; v_org uuid; v_coach_email text; v_program text;
  v_eval_email text; v_in_pool int; v_count int;
begin
  select enrollment_id, org_id into v_enrollment, v_org
    from reservations where id = new.reservation_id;
  if new.org_id is null then new.org_id := v_org; end if;
  if new.org_id <> v_org then
    raise exception 'Incohérence d''organisme sur le jury.' using errcode = '23514';
  end if;

  select coach_email, program into v_coach_email, v_program
    from enrollments_ro where id = v_enrollment;
  select email into v_eval_email from profiles where id = new.evaluator_id;

  if v_coach_email is not null and lower(v_eval_email) = lower(v_coach_email) then
    raise exception 'Le coach référent ne peut pas faire partie du jury de son apprenant.'
      using errcode = '23514';
  end if;

  select count(*) into v_in_pool
    from evaluator_pool ep
    where ep.evaluator_id = new.evaluator_id
      and ep.program = v_program
      and ep.org_id = v_org;
  if v_in_pool = 0 then
    raise exception 'Évaluateur hors du vivier du programme « % ».', v_program
      using errcode = '23514';
  end if;

  select count(*) into v_count
    from reservation_evaluators where reservation_id = new.reservation_id;
  if v_count >= 2 then
    raise exception 'Un jury comporte au plus deux évaluateurs.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_evaluator_rules on reservation_evaluators;
create trigger trg_evaluator_rules
  before insert on reservation_evaluators
  for each row execute function enforce_evaluator_rules();

-- -----------------------------------------------------------------------------
-- 6) Confirmation gate for defenses: exactly two evaluators, none of whom is the
--    referent coach (re-checked at confirmation, per the 0001 design note).
-- -----------------------------------------------------------------------------
create or replace function enforce_defense_confirmation()
returns trigger language plpgsql as $$
declare v_coach_email text; v_eval int; v_conflict int;
begin
  if new.kind = 'defense'
     and new.status = 'confirmed'
     and old.status is distinct from 'confirmed' then

    select coach_email into v_coach_email from enrollments_ro where id = new.enrollment_id;

    select count(*) into v_eval
      from reservation_evaluators where reservation_id = new.id;
    if v_eval <> 2 then
      raise exception 'Une soutenance requiert exactement deux évaluateurs (actuellement %).', v_eval
        using errcode = '23514';
    end if;

    select count(*) into v_conflict
      from reservation_evaluators re
      join profiles p on p.id = re.evaluator_id
      where re.reservation_id = new.id
        and v_coach_email is not null
        and lower(p.email) = lower(v_coach_email);
    if v_conflict > 0 then
      raise exception 'Le coach référent ne peut pas faire partie du jury.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_defense_confirmation on reservations;
create trigger trg_defense_confirmation
  before update on reservations
  for each row execute function enforce_defense_confirmation();
-- =============================================================================
