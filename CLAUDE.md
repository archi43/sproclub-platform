# SproCLUB Platform — contexte projet (pour Claude Code)

## But
Plateforme pédagogique **multi-locataire (SaaS)**, hébergée par SproCLUB, capable
d'accueillir de nouvelles formations et d'être répliquée à d'autres organismes de
formation. Principe directeur : **multi-locataire par conception, mono-organisme au
lancement** (SproCLUB d'abord).

## Décisions d'architecture
- **Socle de vérité du produit : Postgres** (via Supabase, région UE).
- **Airtable = connecteur propre à SproCLUB** (back office existant), pas le socle.
- **Cloisonnement en pool** : une base partagée, chaque ligne porte `org_id`,
  isolation par Row Level Security (`is_member(org_id)`), option base dédiée plus tard.
- **Stack** : Next.js (App Router, TypeScript) + Supabase (Auth, Postgres, RLS, Storage)
  + Cal.com pour la réservation (événements collectifs, jury de deux), Google Agenda transparent.

## Structure
- `src/middleware.ts` — résolution du tenant (domaine → organisme) + refresh session.
- `src/lib/tenant.ts` — résolution de l'organisme ; `src/lib/supabase/*` — clients.
- `src/app/(portal)/mon-parcours` — portail apprenant (pilote, écran P.A1).
- `supabase/migrations/0001_pilot_schema.sql` puis `0002_tenancy.sql`.

## Conventions (standards équipe senior)
- TypeScript strict, code et identifiants en anglais, commentaires utiles en français.
- Séparation présentation / métier / accès aux données.
- **Sécurité** : aucun secret dans le dépôt (`.env.local`, gestionnaire de secrets en prod) ;
  RLS côté serveur ; journalisation des accès aux dossiers ; hébergement UE (RGPD).
- Tests (unitaires + bout en bout sur la réservation), intégration continue (`.github/workflows/ci.yml`).

## Trajectoire (7 étapes)
0 Assainissement · 1 Fondations · 2 Pilote (portail apprenant + réservation) ·
3 Portail coach · 4 Administration · 5 Reporting · 6 Extension programme ·
7 Ouverture à d'autres organismes.

## État actuel
Étape 1 amorcée : squelette Next.js multi-tenant, migrations pilote + cloisonnement,
un premier écran apprenant lisant `enrollments_ro` filtré par organisme.

## Backlog immédiat
1. `npm install` puis `npm run typecheck` (valider la compilation en local).
2. Authentification Supabase (lien e-mail) + gardes de route par rôle.
3. Appliquer les migrations, créer l'organisme SproCLUB (bloc Bootstrap de `0002_tenancy.sql`).
4. Contexte d'organisme en base (`app.current_org_id`) dans la couche d'accès aux données.
5. Réservation Cal.com (deux calendriers, jury de deux hors coach, ouverture au dépôt du livrable).
6. Brancher la synchronisation `../sync_cible` vers Postgres pour l'organisme SproCLUB.

## Documents de référence (dossier parent SPROPULSE)
Cahier de conception, cahier des charges écran par écran, dictionnaire de données,
plan de recette, note d'architecture technique, note d'architecture multi-locataire,
cadrage technique, schémas `pilote_schema.sql` et `tenancy_schema.sql`.
