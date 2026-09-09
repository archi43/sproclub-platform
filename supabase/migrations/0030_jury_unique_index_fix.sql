-- 0030 — Correctif de l'index d'unicité des appréciations de jury (INC-28).
--
-- `0029` posait un index unique PARTIEL sur (reservation_id, author_id) avec un
-- `where reservation_id is not null`. Deux problèmes :
--
--   1. un index partiel ne peut pas servir de cible à `ON CONFLICT (…)` sans
--      que la requête répète exactement le même prédicat — ce que PostgREST ne
--      fait pas. La correction d'une note échouait donc avec « there is no
--      unique or exclusion constraint matching the ON CONFLICT specification » ;
--   2. le prédicat était de toute façon superflu : Postgres traite les `NULL`
--      comme distincts dans un index unique, donc les comptes rendus sans
--      réservation (ceux de Fillout, 2 181 lignes) ne se gênent pas entre eux.
--
-- L'invariant visé est inchangé : un auteur, une note par soutenance. Un second
-- envoi corrige au lieu d'ajouter, pour qu'un double clic ne fausse aucune
-- moyenne calculée en aval.
drop index if exists coaching_reports_one_per_evaluator_idx;

create unique index if not exists coaching_reports_one_per_evaluator_idx
  on coaching_reports (reservation_id, author_id);
