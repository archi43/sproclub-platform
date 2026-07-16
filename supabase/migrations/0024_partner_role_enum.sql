-- =============================================================================
-- SproCLUB platform — INC-17: rôle « partner » (entreprises partenaires)
-- Addendum to 0001 → 0023.
--
-- Migration volontairement MINIMALE : Postgres interdit d'UTILISER une nouvelle
-- valeur d'enum dans la transaction qui l'ajoute (policies de 0025). L'ajout de
-- la valeur vit donc seul ici ; tout le schéma vivier est dans 0025.
-- Run AFTER 0023.
-- =============================================================================

alter type app_role add value if not exists 'partner';
-- =============================================================================
