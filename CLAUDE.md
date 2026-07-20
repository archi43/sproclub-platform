# SproCLUB Platform — contexte projet (pour Claude Code)

## But
Plateforme pédagogique **multi-locataire (SaaS)**, hébergée par SproCLUB, capable
d'accueillir de nouvelles formations et d'être répliquée à d'autres organismes de
formation. Principe directeur : **multi-locataire par conception, mono-organisme au
lancement** (SproCLUB d'abord).

## Décisions d'architecture
- **Socle de vérité du produit : Postgres** (via Supabase, région UE).
- **Airtable = back office SproCLUB, bidirectionnel** (décision INC-14, validée) : lu chaque
  jour (Commandes → Postgres) et **write-back CREATE-only** des comptes rendus
  (coaching_reports → « Comptes rendus -header », jamais de modification/suppression).
  Les soutenances ne sont PAS poussées (la table Airtable est alimentée via Google Agenda,
  que Cal.eu remplit déjà — éviter les doublons). **Fillout = source d'évaluations connectée**
  au natif (mêmes tables, `source` tracée). Supabase reste le **socle produit assumé**.
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
  Radix, accessibles) comme base de composants. **`lucide-react`** pour l'iconographie
  (nav, actions, statuts).
- **Montserrat** (titres) et **Hind Madurai** (texte) chargées via `next/font`, exposées
  en variables CSS `--font-heading` / `--font-body`.
- Un seul jeu de **design tokens** (couleurs, typo, espacements) ; aucun style ad hoc.

**Direction visuelle : épuré / minimal** (mêmes couleurs de marque, application modernisée) —
surfaces plates, **filets fins** (`line`) au lieu de bordures marquées + ombres, plus d'air,
navy réservé aux accents (texte secondaire en `muted`). L'app shell est une **sidebar claire**
à gauche (rail de nav vertical avec icônes lucide, item actif surligné `brand-tint`, marque en
haut, déconnexion en bas), qui se replie en **barre + tiroir** sur mobile.

**Charte** :
- Couleurs : primaire `#24365E` (`brand`), accent `#F74335` ; + `brand-dark #1A2947`,
  `brand-tint #EEF1F7`, `accent-tint #FEE7E5`, `ink #1A1A1A`, `muted #5B6472` (texte
  secondaire), `line #E7E8EC` (filet fin), `surface #FAFAFB` (fond quasi blanc),
  `success #2E7D32`, `warning #B8860B`, `error #C0392B`. (`grey-600`/`grey-300` conservés
  pour compat mais remplacés par `muted`/`line` dans l'UI.)
- Typo : titres Montserrat 600/700, texte Hind Madurai 400/500 ; fallbacks `system-ui`.
- Logo shield `pro/club` dans l'en-tête ; version blanche sur fond bleu, espace de garde.
- Le rouge sert aux accents, CTA et alertes, **jamais** au petit texte sur blanc (contraste).

**Primitives d'UI** dans `src/components/ui`, réutilisées partout (aucune page ne les recode) :
Button, Input/Select/Textarea, Card, Table, Badge, Alert, Tabs, Dialog, Toast, Skeleton,
EmptyState, PageHeader.

**App shell et navigation** (`src/components/app-shell.tsx` + `src/components/sidebar.tsx`) :
- **Sidebar claire à gauche** (desktop) : marque + nom de l'organisme en haut, nav verticale
  par rôle avec icônes lucide (item actif `brand-tint`/`aria-current`), déconnexion épinglée
  en bas. Sur mobile : barre supérieure + tiroir (`aria-modal`). Skip-link conservé.
- Le rôle passe ses `NavItem[]` (avec `icon`) au shell ; le contenu occupe la colonne
  principale (conteneur à largeur max, échelle 4/8 px, hiérarchie typo claire, état actif visible).

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
- `src/app/(staff)/coordination` — affectation du jury + `coordination/administration` (INC-10 :
  gestion utilisateurs/rôles + vivier), gardés par `direction`/`coordinator`.
- `src/lib/data/members.ts`, `src/lib/data/evaluators.ts` — gestion des memberships/vivier (RLS) ;
  `src/lib/members/provision.ts` — invitation service-role ; `src/lib/supabase/admin.ts` — client
  service-role factoré (bypass RLS, derrière garde de rôle).
- `src/lib/data/operations.ts` — file d'actions priorisée S1.1 (opérations, lecture RLS) ;
  écran `src/app/(staff)/coordination/operations`.
- `src/app/(coach)` — portail coach (route group gardé `coach`) : « Mes apprenants » +
  dossier + saisie CR ; `src/lib/data/coaching.ts` (lecture/écriture RLS des `coaching_reports`).
- `src/lib/compliance-rules.ts` (règles pures, testées hors DB) + `src/lib/data/compliance.ts`
  (lecture RLS) ; écrans `coordination/pilotage` (S0.1) et `coordination/conformite` (S3.1).
- `src/lib/reporting-rules.ts` (pur : segmentation + CSV, garde anti-injection de formule) +
  `src/lib/data/reporting.ts` ; écran `coordination/reporting`, export `coordination/reporting/export`
  (route gardée, tracée), cron `api/admin/export-bpf` (Module 5).
- `src/lib/data/learner-dossier.ts` + écran `mon-parcours/dossier` (P.A2) ; documents via
  **Supabase Storage** (bucket privé `learner-docs`, RLS par org+apprenant `0015`, chemin
  `{org_id}/{email}/{fichier}`, écriture service-role uniquement).
- `src/lib/documents/*` (contenu pur + rendu **pdf-lib**) + `src/lib/data/documents-admin.ts`
  (génération service-role derrière garde staff) ; journal `document_emissions` (`0016`) ; UI de
  génération sur la fiche apprenant (Module INC-9).
- `src/lib/data/rgpd.ts` (INC-11) : audit (`audit_log` + `log_access` definer, `0017`), export des
  données personnelles, effacement (anonymisation en place + `data_erasures` consultée par la sync).
  `src/lib/rgpd-rules.ts` : règle pure `decideAccountErasure` (ne jamais supprimer un compte
  référencé ailleurs → cascade), testée hors DB. `0018`/`0019` verrouillent `is_erased`
  (service-role only ; `0019` révoque le grant par défaut Supabase à anon/authenticated).
  `RETENTION.md` documente durées + droits. Section RGPD sur la fiche apprenant (clients injectables
  pour prouver l'effacement en test ; journal ignoré sur préfetch Next).
- `src/lib/data/ops.ts` (INC-12) : journal d'exploitation `ops_events` (org_id + RLS staff, écrit
  service-role) + `checkRateLimit` (RPC `rate_limit_touch`, `0020`) ; `src/lib/ratelimit-rules.ts`
  (pur : identifiant client + limites nommées, testé hors DB). Écran `coordination/exploitation`
  (tuiles + filtre niveau). Rate limiting du login + logs des routes publiques/crons. Cron
  `api/admin/purge-retention` (purge de rétention automatisée). Alerting webhook optionnel
  (`OPS_ALERT_WEBHOOK`, aucun secret au dépôt). `RUNBOOK.md` : incident, sauvegarde/restauration,
  rotation des secrets.
- `src/lib/notification-rules.ts` (INC-7, pur : relances dues + `dedupeKey` stable) + `src/lib/data/
  notifications.ts` (calcul service-role, enqueue idempotent, dispatch, journal ; clients/mailer/horloge
  injectables) + port `src/lib/notifications/mailer.ts` (adaptateur Resend, **dégradation propre** si non
  configuré). Tables `notifications` (journal, unique `org_id,dedupe_key`) + `notification_prefs` (opt-out)
  (`0021`, RLS staff). Cron `api/admin/run-notifications` (rappels soutenance/fin d'accès/CR) ; écran
  `coordination/notifications` (journal). Anti-doublon Airtable via `NOTIF_DISABLED_KINDS`.
- `src/lib/l360-rules.ts` (INC-15, pur : n° de projet depuis le nom de parcours, cours de rendu =
  dernier cours, décision dépôt/validation) + `src/lib/l360/client.ts` (port + adaptateur API v2
  360Learning, OAuth2, lecture seule, dégradation propre) + `src/lib/l360/sync.ts` (auto-découverte
  `l360_path_mappings`, reflet dépôt/validation JURY dans `project_deliverables`, jointure e-mail,
  skip-list RGPD, idempotent). Route cron horaire `api/admin/sync-l360` (`0023`).
- `src/lib/talent-rules.ts` (INC-17, pur : disponibilité — statut coordination > déclaratif
  apprenant > état de formation) + `src/lib/data/talent.ts` (vivier RLS : vue `talent_pool` pour
  les partenaires, consentement apprenant, statut staff, entreprises). Portail
  `src/app/(partner)/vivier` (rôle `partner`, rattaché à une `partner_companies` via
  `memberships.partner_company_id`) ; écran apprenant `mon-parcours/visibilite` (consentement
  explicite révocable + dispo déclarative) ; administration (entreprises + invitation partner) ;
  fiche apprenant (statut vivier). Migrations `0024` (enum) + `0025` (schéma + vue + trigger).
- `src/lib/job-rules.ts` (INC-18, pur : machine à états de modération des offres) +
  `src/lib/data/jobs.ts` (offres, intérêts, candidats via vue `job_offer_candidates`, besoins de
  formation). Écrans `(partner)/offres` (+ `/[id]` candidats) et `(partner)/besoins`,
  `mon-parcours/offres` (apprenant, intérêt un clic), `coordination/recrutement` (modération +
  suivi des besoins). Migration `0026` : `job_offers` (modération par trigger), `job_interests`,
  `partner_training_needs`, vue `job_offer_candidates` (consentants au vivier), `my_partner_company()`.
- `supabase/migrations/0001` → `0026` ; seed `supabase/seed/sproclub_bootstrap.sql`.
  (`0004` invariants réservation, `0005` normalisation e-mails minuscules à l'écriture,
  `0012` gestion utilisateurs/rôles : désactivation qui coupe l'accès + policies de gestion,
  `0013` `enrollments_ro.pending_reports` pour la file d'opérations, `0014` portail coach :
  périmètre coach resserré (RLS) + table `coaching_reports`, `0016` `document_emissions`,
  `0017` RGPD (`audit_log`/`log_access`, `data_erasures`/`is_erased`), `0018`/`0019` lockdown `is_erased`,
  `0020` exploitation (`ops_events` + `rate_limit_events`/`rate_limit_touch`),
  `0021` notifications (`notifications` + `notification_prefs`).)

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
Migrations **0001→0026** + seed appliqués. Suite de tests **133/133** verte contre la vraie base
(inclut `test:rgpd` 10, `test:observability` 6, `test:notifications` 8, `test:nav` 5, `test:members` 3,
`test:l360` 13, `tests/inc14` 7, `test:talent` 12, `test:jobs` 11). Exécution **sérialisée**
(`npm test` → `--test-concurrency=1`) pour éviter la flakiness de rate-limit auth sous concurrence.
**6 crons Vercel** (sync 05:00, sync 360L filet quotidien 05:45, miroir 06:30, export BPF lundi 07:00,
purge rétention 03:15, relances 08:00) + **workflow GitHub Actions horaire** `sync-l360-hourly`
(le plan Vercel Hobby n'autorise que des crons quotidiens ; l'horaire passe par Actions,
activé en posant le secret `CRON_SECRET` dans GitHub). Note déploiement :
appliquer chaque migration **avant** le code (0012 : garde de rôle lit `memberships.deactivated_at` ;
0013 : sync écrit `enrollments_ro.pending_reports` ; 0014 : portail coach lit `coaching_reports` ;
0017→0019 : audit + effacement RGPD, `is_erased` réservé au service-role ;
0020 : exploitation, `ops_events` lu par l'écran + routes/crons y écrivent, `rate_limit_touch` réservé au service-role ;
0021 : notifications, cron `run-notifications` écrit `notifications`, écran + prefs lus par le staff ;
0023 : pont 360L, cron `sync-l360` écrit `l360_path_mappings` + `project_deliverables`, UI lit
`validated_at`/`source` ;
0024→0025 : vivier partenaires — 0024 (enum) doit précéder 0025 (policies qui utilisent
'partner'), les portails lisent la vue `talent_pool` et les écrans staff `partner_companies`).

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
- **INC-10 (gestion des utilisateurs et des rôles)** : écran admin `coordination/administration`
  (direction/coordinator). Invitation = provisioning **service-role** (`src/lib/members/provision.ts` :
  find-or-create auth user + claim `app_metadata.org_id` + profile + membership, avec compensation) —
  seule opération que la RLS ne peut faire. **Désactivation qui coupe réellement l'accès** :
  `memberships.deactivated_at`/`deactivated_by` (`0012`), et les helpers `is_member`/`has_org_role`/
  `has_current_org_role`/`shares_org_with`/`set_current_org` ignorent les lignes désactivées → RLS
  refuse tout. Attribution des écritures (CA-T3) via `invited_by`/`deactivated_by`. Rôles/vivier gérés
  **par la RLS** (`src/lib/data/members.ts`, `src/lib/data/evaluators.ts`, client injecté) : nouvelles
  policies `membership_staff_read` + `membership_manage` (0012) — direction/coordinator gèrent, un
  coordinateur ne peut **jamais** créer/modifier/supprimer un membership `direction`. Gardes appli :
  pas d'auto-désactivation, dernier compte de direction protégé. Client admin factoré
  (`src/lib/supabase/admin.ts`, réutilisé par `tenant.ts` + route sync). `test:roles` **6/6** (matrice
  RLS, coupure d'accès, réactivation) ; **non-régression 14/14**. **Correctif (bug prod)** : depuis `0012`,
  `memberships` a 3 FK vers `profiles` → l'embed PostgREST `profile:profiles(...)` était ambigu et cassait
  l'écran Administration ; désambiguïsé en `profiles!memberships_profile_id_fkey` (`listMembers`,
  `listEvaluatorCandidates`), couvert par `test:members` 3.
- **INC-3 (opérations pédagogiques, Module 1 / S1.1)** : écran `coordination/operations`
  « Conduite de la semaine » — file d'actions **triée par urgence** sur données réelles :
  soutenances à venir (+ jury à compléter), **accès serveur à libérer** (`access_end_date` ≤30/≤7 j,
  = « base de l'alerte serveurs » du dictionnaire), apprenants en retard (`late_days`), comptes rendus
  à saisir (`pending_reports`, ajouté à la sync — `0013`). Dossiers « Terminé » exclus ; filtre
  programme ; liens vers fiche apprenant et affectation jury (règle coach≠évaluateur déjà en base 0004).
  Lecture RLS (`src/lib/data/operations.ts`, client requête-scopé). `test:operations` **5/5** (fenêtre
  d'alerte, exclusions, tri, jury incomplet, périmètre coach). **Différé** (données Airtable non
  synchronisées) : gestion complète des serveurs SAP (table *Affectation ressources*) et calendrier
  planning S1.2 → futur incrément d'extension de sync.
- **INC-4 (portail coach + boucle réservation, Étape 3)** : route group `src/app/(coach)` gardé
  `coach` — « Mes apprenants » (avancement, planning, soutenances, livrables) et saisie des **comptes
  rendus/notes** (`coaching_reports`, app-owned, `0014`), **visibles côté admin** (fiche apprenant).
  **Périmètre coach resserré en RLS** (`0014`) : `learners_read`/`reservations_staff_read`/
  `deliverables_staff_read` limitent désormais le coach à ses **propres** dossiers (`coach_email`) ;
  policy `coaching_reports_coach_manage` (écrit ses dossiers, auteur = lui-même) + `_staff_read`
  (direction/coordinator). À la confirmation d'une soutenance, les deux évaluateurs sont ajoutés
  comme **invités Cal.eu** (`BookingProvider.addGuests` → `PATCH /bookings`, best-effort, dégradation
  propre). `test:coach` **5/5** (périmètre étanche, écriture scoped, auteur=appelant, visibilité admin) ;
  **non-régression**. **Différé + credential** : remontée Airtable des CR (token **write**, actuellement
  read-only) et publication multi-coach des disponibilités (config Cal.eu par coach).
- **INC-11 (RGPD : audit, export, droit à l'oubli)** : **journal d'audit** (`audit_log` + `log_access`
  SECURITY DEFINER, `0017`) — un appelant ne trace que pour son org/identité, actions en liste blanche,
  lecture direction/coordinator ; **export** des données personnelles (route gardée, tracée, bornée RLS) ;
  **effacement** (direction only, mot de confirmation) : anonymisation **en place** (id/FK conservés),
  neutralisation des identifiants d'insertion, purge des documents (paginée), suppression du compte
  **uniquement** s'il n'est pas référencé ailleurs (règle pure `decideAccountErasure` — pas de
  cascade-delete de tiers), et **liste de suppression** (`data_erasures`) que la sync consulte pour ne
  jamais réimporter. `is_erased` verrouillé service-role (`0018`/`0019`, corrige une fuite inter-locataire).
  `test:rgpd` **10** (5 pur + 5 intégration : attribution, journal staff-only, registre org-scoped +
  écriture refusée, anonymisation à FK intacte, skip-list de sync) ; **non-régression**. `RETENTION.md`
  documente durées + droits. **Différé** : purge automatique (cron) → INC-12.
- **INC-12 (exploitation et observabilité)** : **journal d'exploitation** (`ops_events`, org_id + RLS
  staff-read, écrit service-role, `0020`) alimenté par les crons (sync/miroir/export/purge), l'action de
  connexion et les routes ; écran `coordination/exploitation` (tuiles 24 h/7 j, filtre niveau, charte).
  **Rate limiting** des points d'entrée publics : `rate_limit_touch` (SECURITY DEFINER service-role) +
  table verrouillée `rate_limit_events` (fenêtre glissante) ; login limité (5/15 min/IP, fail-safe),
  observation bornée des sondages sur endpoints protégés. **Purge de rétention** automatisée (cron
  `api/admin/purge-retention` : `audit_log` 12 mois, `ops_events` 90 j, `rate_limit_events` 2 j — finit
  le différé INC-11). **Alerting** optionnel par webhook (`OPS_ALERT_WEBHOOK`, aucun secret au dépôt).
  `RUNBOOK.md` (incident, sauvegarde/restauration testée, rotation des secrets Cal.eu/Airtable/
  service-role/`CRON_SECRET`). `src/lib/ratelimit-rules.ts` pur (login limité par IP **et** par
  e-mail destinataire). `test:observability` **6** (3 pur + 3 intégration : fenêtre de débit, fonction
  service-role only, table verrouillée, RLS `ops_events` staff/coach/isolation) ; **non-régression**. **Différé** : exécution réelle du test de restauration
  en staging (procédure documentée) ; SMTP dédié (Resend).
- **INC-7 (notifications et relances)** : pipeline **calcul → enqueue idempotent → dispatch** des
  relances e-mail (rappel de soutenance ≤3 j, fin d'accès serveur ≤7 j, comptes rendus à saisir → coach),
  calculées depuis le modèle opérationnel. Règle **pure** `buildDueNotifications` (relances dues +
  `dedupeKey` stable, testée hors DB). **Port/adaptateur** mailer (`src/lib/notifications/mailer.ts`,
  Resend) avec **dégradation propre** : sans credential, les relances restent `pending` sans casser
  l'app. Journal `notifications` (unique `org_id,dedupe_key` → idempotence cron), préférences d'**opt-out**
  `notification_prefs`, RLS staff (`0021`). Cron `api/admin/run-notifications` (résumé dans le journal
  d'exploitation) ; écran `coordination/notifications`. **Anti-doublon Airtable** via `NOTIF_DISABLED_KINDS`.
  `test:notifications` **8** (5 pur + 3 intégration : idempotence, RLS staff/coach/isolation, opt-out) ;
  **non-régression**. **Pause credential** : `RESEND_API_KEY` + `NOTIF_FROM` pour activer l'envoi réel.
  **Différé** : échéances CPF (champ absent du modèle) ; confirmations événementielles.
- **INC-13 (accessibilité et mobile)** : app shell accessible — **lien d'évitement** (skip to content) +
  `main#main-content` focusable, **nav active** (`aria-current` + état visible, composant client
  `src/components/nav-tabs.tsx`), **viewport** explicite (zoom autorisé, a11y), cibles tactiles ≥44px,
  `Th scope="col"`. Logique d'onglet actif extraite en **règle pure** `src/lib/nav-active.ts`
  (`test:nav` 5 : match exact, enfant profond, racine de section, frontière de segment). Tables déjà
  responsives (primitive `overflow-x-auto`), grilles label/valeur adaptatives, focus-visible global.
  Vérif : `next lint` (jsx-a11y) vert ; contrôle **axe-core ponctuel** (0 violation WCAG 2 A/AA sur page
  publique, manuel — non automatisé en CI) ; pas de débordement horizontal ; **non-régression 86/86**.
  Pas de schéma/RLS (incrément front).
- **INC-15 (pont 360Learning : livrables de projet)** : contrainte métier — les apprenants déposent
  sur 360L et le **JURY** évalue/valide (déblocage du projet suivant natif 360L, non pilotable par
  API : la v2 n'expose ni fichiers ni écriture, vérifié en réel). Sync **lecture seule, horaire**
  (`api/admin/sync-l360`, CRON_SECRET) : auto-découverte des parcours « Projet n°X » →
  `l360_path_mappings` (insert-only, ajustements manuels autoritaires, RLS staff-read, `0023`) ;
  **dépôt** = tentative clôturée sur le cours de rendu (dernier cours du parcours) →
  `deliverable_submitted` + `submitted_at` (débloque la soutenance, trigger `0004`) ; **validation
  jury** = parcours `successful` → `validated_at` + `l360_score` (sémantique validée sur données
  réelles : `onTime` plafonne à 97 %, `successful` = 100). Jointure par e-mail normalisé, skip-list
  RGPD (`data_erasures`), e-mails inconnus comptés, **jamais de downgrade** (on n'écrit que des
  dépôts avérés ; `source` tracée `platform`/`l360`). Port/adaptateur `src/lib/l360/client.ts`
  (OAuth2 client credentials, token caché, pagination Link, dégradation propre) ; règles pures
  `src/lib/l360-rules.ts`. Badges « Validé par le jury » (portail apprenant + dossier coach).
  `test:l360` **13** (8 pur + 5 intégration : reflet + RGPD, idempotence, RLS, garde-fou
  anti-réécriture d'un livrable validé — trigger `protect_l360_deliverable` ; tolérance aux
  pannes de l'API 360L : un parcours en échec est sauté et compté (`fetchErrors`), jamais fatal).
  **Actif en production** : credentials Vercel + secret GitHub posés ; premier run réel vérifié
  (61 mappings auto-découverts, 1 789 livrables reflétés dont 1 421 validés jury, re-run idempotent).
- **INC-16 (activation Fillout, tout le périmètre évaluatif)** : `FILLOUT_FORM_IDS` = **27
  formulaires** (5 comptes rendus, 11 évaluations projet, 6 soutenances projet, 4 grilles
  d'évaluation, suivi étudiant). Les formulaires SproCLUB sont **adossés à Airtable** : pas
  d'e-mail, l'apprenant est un RecordPicker → jointure par **recordID** : Commande directe
  (« Etudiant(s) », « Sales Orders-header ») ou **via la table Soutenances** (map
  recordID soutenance → Commande, `fetchSoutenanceCommandeMap`, injectée dans `syncFillout`) ;
  repli e-mail conservé ; `matchedByRecordId`/`matchedViaSoutenance` tracés. Différé :
  chaînes « Session Onboarding »/« Examen » (~220 soumissions, tables intermédiaires). Normalisation : date de session (DatePicker), note = moyenne des
  **StarRating**, RecordPicker/FileUpload lisibles. **Anti-doublon write-back** : les CR
  `source='fillout'` sont exclus du write-back Airtable (les formulaires y créent déjà leur
  record) — `listPendingWritebackReports` filtré, prouvé par test. `tests/inc14` **7**.
  **Actif en production** : 2 139/2 222 soumissions historiques rattachées (610 direct,
  1 529 via Soutenances), 1 449 notées, 278 dossiers alimentés.
- **INC-17 (vivier de talents — entreprises partenaires)** : rôle `partner` (rattaché à une
  `partner_companies` via `memberships.partner_company_id`), **nominatif avec consentement
  explicite** de l'apprenant (tracé, révocable — écran `mon-parcours/visibilite`), **synthèse
  chiffrée** temps réel (progression, projets validés, note moyenne jury 360L, assiduité,
  dispo — jamais les commentaires internes), **dispo double** (statut coordination prioritaire,
  règle pure `talent-rules.ts`). Surface partenaire unique : vue `talent_pool` (0025 —
  consentants, org courante, effacés RGPD exclus, grants stricts) ; `staff_status` verrouillé
  par trigger ; effacement RGPD purge le profil. Portail `(partner)/vivier`, administration
  (entreprises + invitation), fiche apprenant (statut vivier). **Revue sécurité passée avec
  correctifs prouvés** : `profiles_org_read` et `availabilities_read` resserrées (un partner
  ne lit ni l'annuaire ni les créneaux), rôle partner impossible sans société (action + vue +
  trigger de cohérence de tenant `memberships_partner_company_org`), consultations du vivier
  **journalisées** (`log_access` étendu à `talent_pool.view`, y compris pour le rôle partner).
  `test:talent` **12** (4 pur + 8 intégration RLS/consentement/isolation/trigger/effacés/
  annuaire verrouillé/audit).
- **INC-18 (jobboard + besoins de formation)** : les entreprises partenaires publient des
  **offres** (modérées par la coordination avant d'être visibles des apprenants — machine à
  états `job-rules.ts` + trigger `protect_job_offer_moderation`) ; l'apprenant marque son
  **intérêt en un clic** ; le partenaire voit les candidats intéressés via la vue
  `job_offer_candidates` (intersection intérêt × consentement vivier — synthèse chiffrée,
  société propriétaire, effacés RGPD exclus). Les entreprises expriment aussi leurs **besoins
  de formation** (`partner_training_needs`, signal B2B vers la coordination, jamais exposé aux
  apprenants, statut verrouillé). `my_partner_company()` (SECURITY DEFINER) résout la société
  du partenaire. `test:jobs` **11** (5 pur + 6 intégration RLS).
  Reste : Étape 7 (ouverture à d'autres organismes).

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
**Tous les incréments INC-0 → INC-15 sont livrés.** Prochaine grande étape : **Étape 7** —
ouverture à d'autres organismes (onboarding par paramétrage, image de marque et domaine par organisme,
audit de sécurité externe). Le socle multi-locataire est déjà en place : c'est une extension, pas une refonte.
Restes différés : INC-3 serveurs SAP + planning S1.2 ; INC-4 remontée Airtable des CR [token write] +
dispos multi-coach ; INC-12 exécution réelle du test de restauration en staging ; INC-7 credential
Resend (`RESEND_API_KEY`/`NOTIF_FROM`) pour l'envoi réel + échéances CPF — en attente d'extension sync / credential.

## Documents de référence (dossier parent SPROPULSE)
Cahier de conception, cahier des charges écran par écran, dictionnaire de données,
plan de recette, note d'architecture technique, note d'architecture multi-locataire,
cadrage technique, schémas `pilote_schema.sql` et `tenancy_schema.sql`.
