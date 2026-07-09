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
- `src/lib/host.ts` — parsing d'hôte pur (Edge-safe) ; `src/lib/tenant.ts` — résolution
  de l'organisme en base (server-only) ; `src/lib/supabase/*` — clients.
- `src/lib/auth.ts` — gardes de route par rôle ; `src/lib/data/*` — accès aux données
  (contexte d'organisme + requêtes métier, séparés de la présentation).
- `src/app/(auth)/login`, `src/app/auth/callback`, `src/app/auth/signout` — auth par lien e-mail.
- `src/app/(portal)/mon-parcours` — portail apprenant (pilote, écran P.A1), gardé par `student`.
- `src/app/(staff)/coordination` — écran d'affectation du jury, gardé par `direction`/`coordinator`.
- `supabase/migrations/0001` → `0005` ; seed `supabase/seed/sproclub_bootstrap.sql`.
  (`0004` invariants réservation, `0005` normalisation e-mails minuscules à l'écriture.)

## Modèle de rôles (décision)
Les rôles sont **par organisme**, portés par `memberships` (org_id, profile_id, role) —
source de vérité unique. La table globale `user_roles` (0001) est conservée mais **plus
utilisée par aucune policy**. Les gardes de route lisent `memberships` ; la RLS (`0003`)
reste le garde-fou serveur. Contexte d'organisme : `current_org_id()` lit le GUC
`app.current_org_id` (posé par la RPC `set_current_org`, transaction-locale) ou, à défaut,
le claim JWT `app_metadata.org_id` (robuste avec le pooling PostgREST).

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
Produit **en ligne** (staging) et prouvé en réel. Base Supabase UE (`zbvohktqfgwajjvnpets`,
`eu-north-1`) ; app déployée sur **Vercel région `fra1`** : **https://sproclub-platform.vercel.app**.
Migrations **0001→0010** + seed appliqués. Suite de tests **14/14** verte contre la vraie base.

Incréments livrés (voir `PLAN_DEV_PRODUIT.md`) :
- **Fondations + pilote (Étapes 1-2)** : multi-locataire (RLS), auth lien e-mail (callback
  PKCE + token_hash) + gardes de rôle, isolation prouvée (`test:isolation` 3/3), invariants
  de réservation en base (`test:booking` 5/5). Portail apprenant (parcours, livrables,
  coaching, soutenance) + coordination (affectation du jury). Cal.eu branché de bout en bout
  (miroir des créneaux, createBooking, cancel). Revue sécurité passée (RLS complète, code
  mort supprimé, open redirect corrigé). Aucun secret au dépôt.
- **INC-0 (mise en ligne)** : déploiement Vercel UE, variables d'env dans Vercel, redirections
  auth Supabase, **2 crons quotidiens** (sync 05:00 UTC, miroir 06:30 UTC), **CI** verte
  (typecheck+build+tests+lint) — enforcement « merge bloqué » = GitHub Pro (dépôt privé),
  resté **indicatif** par choix.
- **INC-1 (données réelles)** : sync **Airtable → Postgres** lecture seule, idempotente
  (`src/lib/sync/*`, route `/api/admin/sync-airtable` + cron). **491 apprenants / 511 dossiers
  réels** synchronisés ; `test:sync` 2/2.
- **INC-2 (espace admin)** : référentiel programmes (Module 4, table `programs` + règle de
  publication) et Module 2 (liste apprenants filtrable + fiche 360 sur données réelles), sous
  `src/app/(staff)/coordination/*`, gardés direction/coordinator ; `test:admin` (RLS de rôle) 4/4.

Comptes de test : student (melissa.blld), coach, coordinator, 3 évaluateurs, hôte Cal.eu (voir `SETUP.md`).
Reste (opérationnel) : **rotation** clé Cal.com + token Airtable (transités par le chat) ;
SMTP dédié (Resend) pour lever la limite d'envoi ; connexion GitHub↔Vercel pour l'auto-deploy fiable.

## Réservation (Étape 2)
Invariants métier **au niveau base** (migration `0004`, triggers), prouvés par
`npm run test:booking` : gating du dépôt de livrable pour les soutenances, jury de deux
jamais le coach référent, évaluateurs issus du vivier du programme, cohérence d'organisme.
Domaine TS : `src/lib/data/reservations.ts` (client injecté), port `src/lib/booking/provider.ts`,
adaptateur `src/lib/booking/calcom.ts` (instance **Cal.eu**, validé en réel). Miroir des créneaux
`src/lib/booking/mirror.ts` + route `POST /api/admin/mirror-availabilities` (secret `CRON_SECRET`)
→ remplit `availabilities` (préfixe ref `cal:`). Types d'événement Coaching/Soutenance créés.
Les actions de réservation (coaching/soutenance) passent par `src/lib/booking/service.ts`
(`bookSlot`) : crée l'événement Cal.eu puis enregistre la réservation avec `calcom_booking_id`,
avec compensation (annulation) si l'insert échoue ; dégradation propre si Cal.com non configuré.
Reste : planification cron du miroir, écran d'affectation du jury, mise à jour du jury sur Cal.eu.

## Backlog immédiat (suite du `PLAN_DEV_PRODUIT.md`)
Séquence recommandée : **INC-10** (gestion des utilisateurs/rôles — indispensable pour
onboarder de vrais comptes), puis **INC-3** (opérations pédagogiques) et **INC-4** (portail
coach + invités jury Cal.eu), puis INC-8/9 (espace apprenant, documents), INC-5/6 (conformité,
reporting), INC-11/12 (RGPD/audit, exploitation) avant ouverture à de vrais étudiants.

## Documents de référence (dossier parent SPROPULSE)
Cahier de conception, cahier des charges écran par écran, dictionnaire de données,
plan de recette, note d'architecture technique, note d'architecture multi-locataire,
cadrage technique, schémas `pilote_schema.sql` et `tenancy_schema.sql`.
