# Etat actuel et incrementes livres

Journal des incrementes. **Extrait de `CLAUDE.md` le 2026-08-01.** A tenir a jour ici
a chaque increment (l'instruction dans `CLAUDE.md` pointe desormais vers ce fichier).
Les faits d'exploitation durables (identifiants d'infra, crons, ordre de deploiement)
sont restes dans `CLAUDE.md`.

Produit **en ligne** (staging) et prouvé en réel. Base Supabase UE (`zbvohktqfgwajjvnpets`,
`eu-north-1`) ; app déployée sur **Vercel région `fra1`** : **https://sproclub-platform.vercel.app**.
Migrations **0001→0027** + seed appliqués. Suite de tests **220/220** verte contre la vraie base
(vérifié le 2026-08-26, 0 sauté ; inclut `test:rgpd` 10, `test:observability` 6,
`test:notifications` 8, `test:nav` 5, `test:members` 3, `test:l360` 13, `tests/inc14` 7,
`test:talent` 12, `test:jobs` 11, `test:availability` 29, `test:journey` 9, `test:search` 6,
`test:design` 17, `test:roles` 12, `test:sync` 15). Exécution **sérialisée**
(`npm test` → `--test-concurrency=1`) pour éviter la flakiness de rate-limit auth sous concurrence.
**7 crons Vercel** (sync 05:00, sync 360L filet quotidien 05:45, agendas 06:00, miroir 06:30,
export BPF lundi 07:00, purge rétention 03:15, relances 08:00) + **workflow GitHub Actions horaire** `sync-l360-hourly`
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
- **Refonte visuelle (PR #27 à #29)** : direction **épurée / minimale** à charte inchangée
  (#24365E / #F74335, Montserrat / Hind Madurai) — surfaces plates, filets fins (`line`)
  au lieu de bordures marquées et d'ombres, navy réservé aux accents, texte secondaire en
  `muted`. App shell repensé en **sidebar claire** à gauche (icônes `lucide-react`, item actif
  `brand-tint` + `aria-current`, déconnexion épinglée en bas), repliée en barre + tiroir sur
  mobile. Connexion par **code OTP** en complément du lien e-mail. Primitive de filtres
  partagée `src/components/ui/filter-bar.tsx` (`FilterBar` / `FilterField` / `FilterCheckbox`,
  rendu **serveur pur** : `<form method="get">` → `searchParams`, aucun JS client, libellé
  visible au-dessus de chaque contrôle) appliquée aux **8 écrans-listes** (apprenants,
  opérations, pilotage, conformité, reporting, exploitation, notifications, vivier).
- **INC-19 (disponibilités des coachs et du jury)** : lève le différé d'INC-4 — `availabilities`
  n'était alimentée que par le miroir Cal.com depuis un compte hôte unique, et le rôle
  `evaluator` n'avait aucune surface applicative. Solution **hybride** : saisie native
  (`availability_rules` récurrentes + `availability_blocks` d'exception, une fermeture
  l'emportant toujours sur une ouverture) **+ agenda externe en lecture seule**
  (`calendar_feeds` iCalendar → `busy_periods` écrites par un job service-role). Règles pures
  `availability-rules.ts` (fuseau Europe/Paris robuste au changement d'heure) et
  `calendar/ics.ts` (parseur minimal + **garde SSRF**). Écran « Mes disponibilités » partagé
  par `/disponibilites` (coach) et le **nouveau portail jury** `(evaluator)` `/jury`. Cron
  `sync-calendars` (06:00), migration `0027`. **Confidentialité** : le lien d'agenda est un
  secret, `calendar_feeds` n'a délibérément aucune policy staff et l'UI n'affiche que l'hôte.
  **Correctif de conception** : `getAvailabilities` renvoyait tous les créneaux de l'organisme ;
  les créneaux `self:` sont désormais filtrés par coach référent (`filterBookableSlots`), ceux
  du miroir `cal:` restent ouverts. `test:availability` **29** (20 pur + 9 intégration).
  Différé : expansion des récurrences (RRULE) des agendas externes ; horizon de publication 60 j.
- **INC-20 (« Mon parcours » conforme au CDC, P.A1)** : l'écran apprenant était quasi vide. Il porte
  désormais l'en-tête de dossier (programme, spécialité, statut, dates de début/fin, fin
  d'accès, coach référent), la **progression** (barre accessible `role="progressbar"`, projets
  validés / requis, livrables déposés, jours de retard, badge et note jury par projet), les
  **prochains rendez-vous** (« À confirmer » / « Confirmé ») et les **alertes** ordonnées par
  urgence. Règles pures `journey-rules.ts` (`buildJourneyAlerts`, seuils fin d'accès 30 j / 7 j,
  échéance 3 j ; un dossier terminé fait taire les alertes ; `progressPercent` accepte les deux
  échelles 0–1 et 0–100 rencontrées dans les données réelles). `test:journey` **9**.
- **INC-21 (recherche d'apprenant)** : champ de recherche libre (nom, prénom, e-mail) sur la liste
  coordination et sur le portefeuille coach, via la primitive `FilterSearch`. Règles pures
  `search-rules.ts` : le terme est **assaini** (les caractères qui altèrent la grammaire de
  filtre PostgREST — virgule, parenthèses, guillemets, `%`, `_`, `*`, `:` — sont neutralisés),
  borné à 80 caractères, ignoré en deçà de 2. Jointure en `!inner` quand un terme est posé (la
  jointure doit filtrer, pas seulement enrichir) et `.or(..., { referencedTable })`. La RLS
  reste le garde-fou : un coach ne peut rien trouver hors de son portefeuille. `test:search` **6**.
- **INC-22 (direction visuelle « Poste de pilotage » + contraste prouvé)** : la direction épurée
  était jugée générique et sans caractère. Trois directions ont été maquettées sur des écrans
  réels à **charte figée** (mêmes couleurs, mêmes polices) ; la retenue fait du navy
  **l'environnement** des rôles qui opèrent (rail sombre, plan de travail clair) et rend le
  rouge à son rôle de **signal**, en greffant dans le contenu l'échelle typographique de la
  direction « Registre » (chiffres en grand, libellés en petites capitales, filets fins).
  **Coque par famille de rôle** (`AppShell tone`) : `navy` pour coordination/coach/jury,
  `light` pour apprenant/entreprise — la coque colorée servira de support à la marque d'un
  autre organisme à l'étape 7. L'item de nav actif porte **trois marques** (fond, filet rouge,
  `aria-current`) : jamais la seule couleur.
  **Jetons unifiés** : `src/lib/design-tokens.ts` devient la source unique, importée par
  `tailwind.config.ts` **et** auditée par les tests — une couleur en dur échapperait à la preuve.
  **Contraste prouvé, pas déclaré** : `contrast-rules.ts` (pur, WCAG 2.1) + `CHARTE_TEXT_PAIRS`
  vérifient toute combinaison texte/fond garantie. Le test a **trouvé deux défauts réels** :
  `warning #B8860B` mesurait 3,25:1 sur blanc et était **déjà en production sur quatre écrans** ;
  `success #2E7D32` tombait à 4,47:1 sur sa propre teinte. Variantes `-ink` ajoutées et usages
  corrigés. Nouvelles primitives `StatTile`/`StatGrid` et colonnes `numeric` (`tabular-nums`).
  `test:design` **17** (11 contraste + 6 synthèse de liste).
  **Écran de connexion repris** : il vit hors de l'app shell et n'héritait donc d'aucune coque
  (première impression sans caractère, beaucoup de vide). Il la reconstitue en deux panneaux —
  navy à gauche (marque, ce que l'accès ouvre, et deux faits qui rassurent : code à usage unique,
  hébergement UE), plan de travail clair à droite. Le panneau navy ne porte **aucun élément
  focusable** : l'anneau de focus global est en navy et y serait invisible.
  **Vrai logo `pro/club`** : le carré « SC » était un substitut. Le logo n'existait dans aucun
  fichier du dépôt ; il a d'abord été extrait de la présentation PDF, puis **remplacé par la source fournie par
  la direction** (PNG 1182 px, canal alpha propre). Décliné en quatre PNG détourés (`{shield,lockup}` × `{white,navy}`) dans `public/brand/`, plus
  un favicon `src/app/icon.png` (l'app n'en avait aucun). `BrandMark` sert la bonne variante
  selon le ton de la coque ; chaque ton a **son fichier**, pas de recoloration CSS. 92 Ko au
  total. À remplacer par une source vectorielle si elle existe.
- **INC-23 (accueil : portail par rôle + cohérence visuelle)** : l'accueil était resté à l'écart
  de la refonte — première URL du produit, il gardait un rendu générique à côté de la connexion
  refaite. Il adopte la même silhouette en deux panneaux. **Et il portait un vrai défaut** : tout
  compte connecté se voyait proposer `/mon-parcours`, le portail apprenant, donc un coach, un
  membre du jury, la coordination ou une entreprise partenaire atterrissait sur une route que sa
  garde de rôle refuse. Table `ROLE_HOME` + règle pure `homeHrefForRoles` (`roles.ts`) : le rôle
  **le plus large** décide, car un coach est souvent aussi évaluateur et le portail jury est plus
  étroit que le sien. Les deux cas limites sont traités explicitement plutôt que par un lien mort :
  domaine sans organisme, et compte sans aucun rôle. `test:roles` complété de **6** tests purs.
- **INC-24 (synchronisation : spécialité, fin prévue, statuts oubliés)** : l'audit de la base a
  montré `specialty` et `end_date` vides à 0 %. Diagnostic initial erroné (« Airtable ne les
  remplit pas ») : en réalité **le mapping ne les écrivait nulle part**, alors qu'Airtable porte
  la donnée. `end_date` ← `Date prévisionnelle de fin`, choisie parmi trois champs de fin parce
  que c'est la seule renseignée sur les dossiers **actifs** (86 %, contre 7 % pour la « réélle »,
  posée à la clôture). `specialty` ← `[OBSOLETE]Spécialisation` : le libellé est périmé, pas la
  donnée (70 % des commandes, 21 spécialisations SAP réelles) ; les valeurs multiples séparées
  par `;` sont conservées. **Troisième défaut trouvé au passage** : `normalizeStatut` ignorait
  `1-Prêt à débuter` (22) et `2-Annulée` (19) — 41 dossiers arrivaient sans statut et
  disparaissaient de tous les compteurs. **Conséquence traitée** : ces dossiers passaient par la
  branche `status IS NULL` du filtre d'exclusion, donc étaient inclus dans la file d'opérations
  et les relances ; une fois nommés, les « Annulée » y seraient restés à tort. D'où
  `src/lib/enrollment-status.ts` (vocabulaire + `EXCLUDE_CLOSED`), partagé par `data/operations`
  et `data/notifications`. **Piège désamorcé** : `.or(a,b)` est un OU — enchaîner deux `neq` au
  premier niveau n'exclut plus rien (vérifié en réel : 530/530 retenus au lieu de 176). Les
  exclusions passent par un `and(...)` imbriqué. `test:sync` complété de **13** tests purs.

  **Vérifié en réel** : rendu de `coordination/apprenants` sous session staff (coque navy,
  marqueur actif, tuiles alimentées par les dossiers réels).
  Reste : Étape 7 (ouverture à d'autres organismes).

Comptes de test : apprenant, coach, coordinateur, 3 évaluateurs, hôte Cal.eu — identifiants
hors dépôt (dépôt public), voir `SETUP.md` et le gestionnaire de secrets.
Reste (opérationnel) : **rotation** clé Cal.com + token Airtable (transités par le chat) ;
SMTP dédié (Resend) pour lever la limite d'envoi ; connexion GitHub↔Vercel pour l'auto-deploy fiable.
