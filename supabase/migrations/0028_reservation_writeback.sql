-- 0028 — Write-back des soutenances vers Airtable (INC-26).
--
-- `reservations.airtable_synced` existait déjà (0001) mais rien ne conservait
-- l'identifiant du record créé côté Airtable. Sans lui on ne peut ni prouver
-- l'idempotence, ni propager plus tard une annulation vers la bonne ligne :
-- on ne saurait pas laquelle. Même colonne, même rôle que sur `coaching_reports`.
alter table reservations
  add column if not exists airtable_record_id text;

comment on column reservations.airtable_record_id is
  'Record id Airtable (table « Soutenances formation ») créé par le write-back. '
  'Null tant que la réservation n''a pas été poussée. Sert de clé de rapprochement '
  'pour ne jamais créer deux fois la même ligne.';

-- Une réservation ne peut correspondre qu'à un seul record Airtable, et un
-- record Airtable ne peut être revendiqué que par une seule réservation :
-- c'est ce qui rend le write-back rejouable sans duplicata, même si un passage
-- est interrompu entre l'appel à Airtable et la mise à jour locale.
create unique index if not exists reservations_airtable_record_id_key
  on reservations (airtable_record_id)
  where airtable_record_id is not null;

-- Retrouver rapidement ce qui reste à pousser.
create index if not exists reservations_pending_writeback_idx
  on reservations (org_id, kind)
  where airtable_synced = false;
