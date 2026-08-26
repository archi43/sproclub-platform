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
- Commits atomiques, messages conventionnels ; mettre à jour `ETAT-ACTUEL.md`
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
EmptyState, PageHeader, FilterBar.

**Filtres des écrans-listes** (`src/components/ui/filter-bar.tsx`) : `FilterBar` +
`FilterField`/`FilterCheckbox`, rendu **serveur pur** (`<form method="get">` → `searchParams`,
aucun JS client), libellé visible au-dessus de chaque contrôle (le `<label>` englobe le champ,
plus d'`aria-label` de substitution), « Réinitialiser » affiché seulement quand un filtre est
posé (`active`). La primitive ne porte **aucune marge extérieure** : l'écran gère son rythme
vertical (`space-y-*` du conteneur, ou `className="mb-6"`). Tout écran-liste passe par elle
(apprenants, opérations, pilotage, conformité, reporting, exploitation, notifications, vivier).

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

## Le patron qui revient partout

Chaque domaine métier suit le même triplet, sans exception :

- `src/lib/<domaine>-rules.ts` : règles **pures**, sans base ni horloge, testées hors DB
  (`compliance-rules`, `reporting-rules`, `rgpd-rules`, `ratelimit-rules`, `notification-rules`,
  `l360-rules`, `talent-rules`, `job-rules`, `availability-rules`, `nav-active`).
- `src/lib/data/<domaine>.ts` : accès aux données **sous RLS**, client injecté (jamais de
  client global, pour que les tests puissent prouver l'isolation).
- Un écran dans le route group du rôle concerné, plus une migration numérotée.

Les intégrations externes suivent **port + adaptateur** dans `src/lib/<service>/` avec
**dégradation propre** si le credential manque : Cal.eu (booking), Airtable (sync),
360Learning (l360), Resend (mailer), iCalendar (calendar).

Le client **service-role** est factoré dans `src/lib/supabase/admin.ts` et ne sert que
derrière une garde de rôle, pour ce que la RLS ne peut pas faire : provisioning d'utilisateur,
écritures de cron, génération de documents.

La carte fichier par fichier est dans `STRUCTURE.md`. En cas de doute, `ls -R src/` fait foi.

## Pièges déjà rencontrés (ne pas les reproduire)

- **`0019` révoque le grant EXECUTE par défaut** que Supabase accorde à `anon` et
  `authenticated`. Sans lui, `is_erased` fuyait entre locataires. Toute nouvelle fonction
  `SECURITY DEFINER` doit être verrouillée de la même façon.
- **`calendar_feeds` n'est lisible que par son propriétaire**, le staff n'y a pas accès.
  C'est délibéré : ce sont des URL d'agenda personnel.
- **Depuis `0012`, `memberships` porte 3 clés étrangères vers `profiles`.** Tout embed
  PostgREST doit être désambiguïsé (`profiles!memberships_profile_id_fkey`), sinon l'écran
  Administration casse en production. C'est déjà arrivé.
- **Sémantique 360Learning validée en réel** : `onTime` plafonne à 97 %, `successful` vaut 100.
  On n'écrit **jamais** un downgrade : seuls les dépôts avérés sont reflétés.
- **Les formulaires Fillout SproCLUB n'ont pas d'e-mail** (l'apprenant est un RecordPicker).
  La jointure passe par recordID : Commande directe, ou via la table Soutenances.
- **`0024` (enum) doit précéder `0025`** (policies qui utilisent la valeur `partner`).

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

## Exploitation (faits durables)

- Base Supabase UE `zbvohktqfgwajjvnpets` (`eu-north-1`) ; app déployée sur **Vercel `fra1`** :
  https://sproclub-platform.vercel.app
- **Appliquer chaque migration AVANT le code qui en dépend.** Le code lit des colonnes et des
  tables que la migration crée ; l'ordre inverse casse la production.
- **`npm test` est sérialisé** (`--test-concurrency=1`). Le rate-limit d'authentification
  Supabase rend la suite instable en parallèle : ne pas paralléliser pour gagner du temps.
- **7 crons Vercel** + un workflow GitHub Actions horaire `sync-l360-hourly`. Le plan Vercel
  Hobby n'autorise que des crons quotidiens, l'horaire passe donc par Actions (secret
  `CRON_SECRET` à poser dans GitHub).
- Dépôt **public**, merge bloqué sans CI verte (ruleset `main-ci-required`). La CI monte un
  Supabase local jetable et exécute la vraie suite d'intégration, sans aucun secret.
- Comptes de test : voir `SETUP.md`.
- **Reste opérationnel** : rotation de la clé Cal.com et du token Airtable (tous deux ont
  transité par le chat) ; SMTP dédié Resend pour lever la limite d'envoi ; connexion
  GitHub↔Vercel pour un auto-deploy fiable.

État détaillé des incréments livrés : **`ETAT-ACTUEL.md`**.

## Trajectoire (7 étapes)
0 Assainissement · 1 Fondations · 2 Pilote (portail apprenant + réservation) ·
3 Portail coach · 4 Administration · 5 Reporting · 6 Extension programme ·
7 Ouverture à d'autres organismes.

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

## Documents de référence
- `STRUCTURE.md` — carte du code, fichier par fichier.
- `ETAT-ACTUEL.md` — journal des incréments livrés.
- `PLAN_DEV_PRODUIT.md` — plan et statut des incréments.
- `SETUP.md`, `RUNBOOK.md`, `RETENTION.md`, `RESTORE_DRILL.md` — exploitation.
- Dossier parent `SPROPULSE` : cahier de conception, cahier des charges écran par écran,
  dictionnaire de données, plan de recette, note d'architecture technique, note d'architecture
  multi-locataire, cadrage technique, schémas `pilote_schema.sql` et `tenancy_schema.sql`.
