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

## Mode de travail : autonomie, vitesse, qualité premium
Objectif : livrer le produit vite, sans sacrifier la qualité. Travaille en **autonomie**,
par **incréments complets**, en suivant `PLAN_DEV_PRODUIT.md` dans l'ordre recommandé.

**Avance sans demander** :
- Traite un incrément entier de bout en bout (schéma + RLS + accès données + UI + tests)
  sans confirmation entre les étapes de routine.
- Tu peux créer/modifier code, migrations (base de dev/test), refactors, tests, docs,
  et committer, sans demander.
- Enchaîne automatiquement l'incrément suivant une fois le précédent **vert et déployé**,
  sauf blocage ci-dessous.

**Pause et demande** (seulement si réellement bloquant), en questions groupées et concises :
- Tout ce qui exige un secret, un identifiant, la création d'un compte externe, une
  autorisation OAuth, un paiement.
- Toute opération destructive ou irréversible sur la base de **production**.
- Tout changement de périmètre produit ou d'architecture non prévu par le plan ou les docs.

**Barème qualité premium (non négociable, à chaque incrément)** :
- TypeScript strict ; séparation présentation / métier / accès données.
- Toute nouvelle table porte `org_id` + policies RLS ; la RLS est le garde-fou serveur,
  jamais un simple filtre d'affichage.
- Tout nouvel invariant métier est prouvé par un test ; isolation et réservation restent
  vertes (non-régression).
- Charte graphique appliquée : titres **Montserrat**, texte **Hind Madurai**, primaire
  **#24365E**, accent **#F74335** ; responsive et accessible (contrastes, clavier, ARIA) ;
  ne pas utiliser le rouge pour du petit texte sur blanc.
- Aucun secret au dépôt ni dans le chat ; hébergement UE (RGPD).
- Commits atomiques, messages conventionnels ; mettre à jour « État actuel » de ce fichier
  et le statut dans `PLAN_DEV_PRODUIT.md` à chaque incrément.

**Auto-vérification avant de dire « fait »** :
- `npm run typecheck && npm run build && npm test` au vert ; **aucun** test désactivé ou
  sauté pour verdir.
- Revue rapide : sécurité (RLS, secrets, redirections), accessibilité, et cohérence avec
  le cahier des charges (dossier `SPROPULSE`).
- Déploiement staging vérifié.

**Vitesse sans dette** :
- Réutilise les patrons existants (port/adaptateur, couche data à client injecté, gardes
  de rôle) ; ne réinvente pas. Vise la tranche verticale utile, pas la sur-ingénierie.
- En cas de doute sur un comportement métier, consulte d'abord les docs de référence
  (cahier des charges écran par écran, dictionnaire de données) plutôt que de demander.

**Boucle** : implémenter → auto-vérifier (vert + revue) → mettre à jour docs → committer
→ déployer → incrément suivant.

## Front-end et design system (qualité premium)
La plateforme doit avoir un rendu **premium et cohérent** sur tous les écrans. Ne jamais
livrer un écran aux styles inline par défaut ; tout passe par les jetons et les primitives.

**Fondation retenue** (chemin rapide, premium et accessible) :
- **Tailwind CSS** avec les jetons de marque dans le thème, et **shadcn/ui** (composants
  Radix, accessibles) comme base de composants.
- **Montserrat** (titres) et **Hind Madurai** (texte) chargées via `next/font`, exposées
  en variables CSS `--font-heading` / `--font-body`.
- Un seul jeu de **design tokens** (couleurs, typo, espacements) ; aucun style ad hoc.

**Charte** :
- Couleurs : primaire `#24365E` (`brand`), accent `#F74335` ; + `brand-dark #1A2947`,
  `brand-tint #E9EDF5`, `accent-tint #FEE7E5`, `ink #1A1A1A`, `grey-600 #4B4B4B`,
  `grey-300 #D1D5DB`, `surface #F7F8FA`, `success #2E7D32`, `warning #B8860B`, `error #C0392B`.
- Typo : titres Montserrat 600/700, texte Hind Madurai 400/500 ; fallbacks `system-ui`.
- Logo shield `pro/club` dans l'en-tête ; version blanche sur fond bleu, espace de garde.
- Le rouge sert aux accents, CTA et alertes, **jamais** au petit texte sur blanc (contraste).

**Primitives d'UI** dans `src/components/ui`, réutilisées partout (aucune page ne les recode) :
Button, Input/Select/Textarea, Card, Table, Badge, Alert, Tabs, Dialog, Toast, Skeleton,
EmptyState, PageHeader.

**App shell et navigation** :
- En-tête commun : logo, nom de l'organisme, menu utilisateur (déconnexion), nav par rôle.
- Conteneur de page à largeur max, échelle d'espacement 4/8 px, hiérarchie typo claire,
  fil d'Ariane sur les vues profondes, état actif visible dans la nav.

**États systématiques sur chaque écran** : chargement (skeleton), vide (message + action),
erreur (message clair), succès (toast). Formulaires : validation au champ, bouton désactivé
pendant l'envoi.

**Accessibilité et responsive (obligatoire)** : mobile-first, navigation clavier, libellés
ARIA, focus visible, contrastes conformes.

**Migration** : refactorer les écrans existants (accueil, login, mon-parcours, coordination)
vers ces jetons et primitives, sans changer la logique.

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
  auth Supabase, **2 crons quotidiens** (sync 05:00 UTC, miroir 06:30 UTC). **La CI exécute la
  vraie suite d'intégration** contre un Supabase **local jetable** (`supabase start`, migrations
  appliquées, 14 tests, 0 sauté) → protège réellement RLS + invariants ; aucun secret (clés
  locales de dev publiques). Grants API explicites (`0011`) pour un Postgres local autonome.
  **Blocage de merge actif** (dépôt public + ruleset `main-ci-required` : job CI requis avant
  merge sur `main`) → « toujours vert » contraignant, via PR. Dépôt : **public**.
- **INC-1 (données réelles)** : sync **Airtable → Postgres** lecture seule, idempotente
  (`src/lib/sync/*`, route `/api/admin/sync-airtable` + cron). **511 dossiers réels** synchronisés
  (519 Commandes, **8 sans e-mail écartées et loggées** — pas de perte silencieuse) ; `test:sync` 2/2.
- **INC-2 (espace admin)** : référentiel programmes (Module 4, table `programs` + règle de
  publication) et Module 2 (liste apprenants filtrable + fiche 360 sur données réelles), sous
  `src/app/(staff)/coordination/*`, gardés direction/coordinator ; `test:admin` (RLS de rôle) 4/4.
- **Design system livré** : Tailwind + tokens de marque (#24365E / #F74335), polices Montserrat/
  Hind Madurai (`next/font`), primitives accessibles `src/components/ui` (Button, Input/Select/
  Textarea/Field, Card, Badge, Alert, Table, PageHeader, EmptyState, Skeleton, ErrorState) + app
  shell. **Charte appliquée à TOUS les écrans** (accueil, login, mon-parcours, portail, coordination) ;
  plus aucun style inline ; états chargement (loading.tsx)/vide/erreur (error.tsx), responsive + a11y.

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
