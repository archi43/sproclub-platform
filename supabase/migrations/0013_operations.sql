-- =============================================================================
-- SproCLUB platform — opérations pédagogiques (INC-3, Module 1 / S1.1)
-- Addendum to 0001 → 0012.
--
-- The weekly priorized task queue (S1.1) is assembled from data that already
-- lands on `enrollments_ro` via the Airtable sync (INC-1/INC-2): real delay
-- (`late_days`), server access deadline (`access_end_date`, the dictionary's
-- "base de l'alerte serveurs"), coach, program, status. The one field the queue
-- needs that was not yet synced is the count of pending evaluation reports
-- ("comptes rendus à saisir"). Add it as a read-model column, populated by the
-- sync mapping (source: Commandes Formation ·
-- "Nombre de compte rendus d'évaluations passées à saisir").
--
-- Read-only model column, nullable → no impact on existing rows or RLS. The
-- existing `enrollments_read` policy (0003) already governs who sees the rows.
-- English identifiers. Run AFTER 0012.
-- =============================================================================

alter table enrollments_ro add column if not exists pending_reports int;
-- =============================================================================
