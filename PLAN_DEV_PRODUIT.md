# Plan de développement — produit complet SproCLUB

Objectif : atteindre le produit interne complet pour SproCLUB, au plus vite, en
incréments gros et bien séquencés, chacun livré **avec ses tests au vert** et validé
sur un environnement en ligne. La commercialisation à d'autres organismes (étape 7)
vient après ; le socle multi-locataire est déjà en place, donc aucun retravail des
fondations n'est nécessaire.

## État de départ (prouvé en réel)
Étapes 1 et 2 opérationnelles : fondations multi-locataires, auth, isolation (3/3),
réservation avec invariants en base (5/5), portail apprenant de base, écran de
coordination du jury. Base Supabase UE, Cal.eu branché.

## Statut d'avancement
- ✅ **INC-0** (mise en ligne) : staging Vercel UE, 2 crons, CI qui exécute la vraie suite
  d'intégration (Supabase local), blocage de merge actif (ruleset, dépôt public).
- ✅ **INC-1** (données réelles) : sync Airtable→Postgres idempotente, 511 dossiers réels.
- ✅ **INC-2** (espace admin) : référentiel programmes + liste/fiche apprenant 360.
- ✅ **Design system** : Tailwind + charte SproCLUB + primitives, appliqué à tous les écrans.
- ✅ **INC-10** (gestion des utilisateurs et des rôles) : écran admin direction/coordinator —
  invitation (provisioning service-role + claim `org_id`), désactivation qui **coupe l'accès**
  via RLS (helpers ignorent les memberships désactivés), rôles par organisme avec attribution
  (`invited_by`/`deactivated_by`, CA-T3), vivier d'évaluateurs par programme. Politiques de
  gestion RLS sur `memberships` (0012) : direction/coordinator gèrent, un coordinateur ne peut
  jamais toucher un compte de direction. `test:roles` (6) + non-régression 14/14.
- ✅ **INC-3** (opérations pédagogiques, Module 1) : écran **S1.1 « Conduite de la semaine »** —
  file d'actions triée par urgence sur données réelles (soutenances à venir + jury à compléter,
  accès serveur à libérer via `access_end_date` ≤30/≤7 j, apprenants en retard, comptes rendus
  à saisir), dossiers terminés exclus, filtre programme, liens vers fiche apprenant et affectation
  jury. Champ `pending_reports` ajouté à la sync (0013). Règle coach≠évaluateur déjà en base (0004).
  `test:operations` (5) + non-régression. **Différé** (données Airtable non synchronisées) : gestion
  complète des serveurs SAP (table Affectation ressources) et calendrier planning S1.2 → incrément
  d'extension de sync ultérieur.
- ✅ **INC-4** (portail coach + boucle réservation, Étape 3) : route group `(coach)` gardé `coach` —
  « Mes apprenants » (avancement, planning, soutenances, livrables) + saisie des **comptes rendus/
  notes** (table `coaching_reports`, 0014), visibles côté admin (fiche apprenant). **Périmètre coach
  resserré** en RLS (learners/reservations/deliverables limités à ses propres dossiers). Invités jury
  ajoutés à l'événement **Cal.eu** à la confirmation (`addGuests`, best-effort). `test:coach` (5) +
  non-régression. **Différé + credential** : remontée Airtable des CR (token write) et publication
  multi-coach des disponibilités (config Cal.eu par coach).
- ✅ **INC-5** (conformité Module 3 + pilotage direction Module 0) : écrans **S3.1** (grille de
  complétude des pièces obligatoires par dossier, dossiers terminés non conformes en rouge, filtre
  programme/CPF) et **S0.1** (pilotage : compteurs par statut, taux réussite/insertion/satisfaction/NPS
  **avec effectif, masqués si n=0 — CA-T5**, alerte dossiers non conformes en tête). Lecture seule sur
  `enrollments_ro` (aucune migration) ; règles métier en fonctions **pures** testées hors DB
  (`test:compliance` 6). Non-régression 36/36.
- ✅ **INC-6** (indicateurs et reporting, Module 5) : écran `coordination/reporting` — tableaux
  **segmentables** (programme/financeur/statut) filtrables par période, indicateurs par segment
  **avec effectif** (CA-T5) ; **export CSV daté** (route gardée direction/coordinator, RLS, garde
  anti-injection de formule, tracé dans `sync_log`) ; **export périodique** (cron `/api/admin/export-bpf`
  hebdo, `CRON_SECRET`). Règles pures testées hors DB (`test:reporting` 7). Non-régression 42/42.
  **Différé** : volet économique (marges/coûts formateurs, données non synchronisées) ; envoi de
  l'export vers Storage/e-mail.
- ✅ **INC-8** (espace apprenant complet — « Mon dossier » P.A2) : écran `mon-parcours/dossier` —
  résultats (avancement, projets, note), certification, insertion, satisfaction, et **documents**
  (attestations…) via **Supabase Storage cloisonné** (bucket privé `learner-docs`, RLS par org +
  par apprenant : chemin `{org_id}/{email}/{fichier}`, `0015`) avec URLs signées courtes. Écritures
  service-role uniquement. `test:storage` (5) prouve l'isolation (apprenant ne lit que ses fichiers,
  cross-org refusé). Non-régression 48/48.
- ✅ **INC-9** (génération de documents) : génération **PDF** (pdf-lib) des attestations d'entrée/fin,
  convention et convocation de soutenance, avec **mentions obligatoires** et données du dossier ;
  archivage dans le bucket `learner-docs` (INC-8) + **journal d'émission** `document_emissions`
  (`0016`, qui/quand/où). Génération service-role derrière garde direction/coordinator ; l'apprenant
  retrouve ses documents (Mon dossier). Contenu en fonctions pures (`test:documents` unit 5) +
  intégration RLS/archivage (4). Non-régression 57/57.
- ✅ **INC-11** (RGPD et journal d'audit) : **traçabilité** des accès aux dossiers (`audit_log` +
  fonction `log_access` SECURITY DEFINER non-forgeable, lecture direction/coordinator ; vue/export/
  effacement tracés, journal ignoré sur préfetch) ; **export** des données personnelles (JSON, route
  gardée, bornée RLS) ; **droit à l'oubli** (direction only, confirmation) : anonymisation **en place**
  de `learners_ro` (id + FK conservés → intégrité), suppression compte **seulement si non référencé
  ailleurs** (règle pure `decideAccountErasure`, pas de cascade-delete de tiers) + documents Storage
  (purge paginée), **liste de suppression** `data_erasures` consultée par la sync (pas de réimport).
  Revue sécurité : `is_erased` verrouillé service-role (`0018`/`0019`) — corrige une fuite inter-locataire.
  `0017`→`0019` + `RETENTION.md`. `test:rgpd` **10** (5 pur + 5 intégration). Suite serialisée
  (`--test-concurrency=1`) → **67/67** déterministe.
- ✅ **INC-12** (exploitation et observabilité) : **journal d'exploitation** (`ops_events`, org_id + RLS
  staff, écrit service-role) alimenté par les crons, l'action de connexion et les routes ; écran
  `coordination/exploitation` (tuiles 24 h/7 j, filtre niveau) ; **rate limiting** du login (fenêtre
  glissante `rate_limit_touch`/`rate_limit_events` verrouillés, `0020`) + observation des sondages sur
  endpoints protégés ; **purge de rétention** automatisée (cron `purge-retention`, finit le différé
  INC-11) ; **alerting** optionnel par webhook (sans secret) ; `RUNBOOK.md` (incident, sauvegarde/
  restauration, rotation des secrets). `0020` + `test:observability` **6** (3 pur + 3 intégration) → **73/73**.
- ✅ **INC-7** (notifications et relances) : pipeline calcul → enqueue idempotent → dispatch des relances
  e-mail (rappel soutenance ≤3 j, fin d'accès serveur ≤7 j, comptes rendus → coach) ; règle pure
  `buildDueNotifications` (+ `dedupeKey` stable) ; port/adaptateur mailer (Resend) à **dégradation propre** ;
  journal `notifications` (unique `org_id,dedupe_key`) + opt-out `notification_prefs` (`0021`, RLS staff) ;
  cron `run-notifications` ; écran `coordination/notifications` ; anti-doublon Airtable (`NOTIF_DISABLED_KINDS`).
  `test:notifications` **8** (5 pur + 3 intégration) → **81/81**. **Pause credential** : `RESEND_API_KEY`/
  `NOTIF_FROM` pour l'envoi réel.
- ✅ **INC-14** (alignement CDC : Airtable écriture + Fillout) : write-back **CREATE-only** des
  comptes rendus vers Airtable « Comptes rendus -header » (idempotent, gated
  `AIRTABLE_WRITEBACK_ENABLED` + token write — **en attente du token**), soutenances non
  poussées (chaîne Cal.eu→Google Agenda→Airtable, anti-doublon) ; **Fillout connecté** aux
  tables natives (`coaching_reports.source='fillout'`, upsert par submissionId, formulaires
  via `FILLOUT_FORM_IDS` — choix des formulaires livré en INC-16) ; Supabase assumé socle
  produit (0022). `tests/inc14` 3/3 ; suite 92/92.
- ✅ **INC-13** (accessibilité et mobile) : app shell accessible — **lien d'évitement** (skip to content),
  **nav active** (`aria-current` + état visible, composant client `NavTabs`), `main#main-content` focusable,
  **viewport** explicite (zoom autorisé), cibles tactiles ≥44px, `Th scope="col"` ; règle pure d'onglet
  actif `nav-active.ts` (`test:nav` 5). Tables déjà responsives (primitive `overflow-x-auto`), grilles
  label/valeur adaptatives. Vérif : `next lint` (jsx-a11y) vert, contrôle axe-core ponctuel (0 violation
  WCAG 2 A/AA, manuel — non en CI), pas de débordement horizontal ; non-régression **86/86**.
- ✅ **INC-15** (pont 360Learning : livrables de projet) : le dépôt et la validation restent DANS
  360L — l'apprenant dépose, le **jury** évalue et valide, le déblocage du projet suivant est natif
  360L (l'API v2 n'expose ni les fichiers ni d'écriture, vérifié). La plateforme se synchronise en
  lecture, **toutes les heures** (workflow GitHub Actions `sync-l360-hourly` — Vercel Hobby ne
  permet que du quotidien — + filet Vercel 05:45) : auto-découverte des parcours « Projet n°X »
  (`l360_path_mappings`, RLS staff-read, `0023`), reflet du **dépôt** (tentative clôturée sur le
  cours de rendu — dernier cours du parcours → `deliverable_submitted`, ce qui débloque la
  réservation de soutenance, trigger `0004`) et de la **validation jury** (parcours `successful` →
  `validated_at` + `l360_score`), jointure par e-mail normalisé, skip-list RGPD respectée, e-mails
  inconnus comptés (pas de perte silencieuse), jamais de downgrade. Port/adaptateur
  `src/lib/l360/*` (OAuth2 API v2, lecture seule, dégradation propre sans credential), règles pures
  `l360-rules.ts` (validées sur les données réelles : `onTime` plafonne à 97 %, `successful` = 100).
  Badges « Validé par le jury » (portail apprenant + dossier coach). `test:l360` **13** (8 pur + 5 intégration RLS/idempotence/RGPD/anti-réécriture/tolérance aux
  pannes 360L) → **105/105**. **Actif en production** (credentials posés, secret GitHub posé,
  premier run réel vérifié : 61 mappings, 1 789 livrables dont 1 421 validés jury, idempotent).
- ✅ **INC-16** (activation Fillout : tout le périmètre évaluatif) : **27 formulaires connectés**
  (`FILLOUT_FORM_IDS` : 5 comptes rendus — coaching/onboarding/certification —, 11 évaluations
  projet, 6 soutenances projet, 4 grilles d'évaluation numérique, suivi étudiant). Découverte
  structurante : les formulaires SproCLUB sont **adossés à Airtable** (RecordPicker, pas d'e-mail) —
  la jointure passe par les **recordIDs candidats** : Commande directe (« Etudiant(s) »,
  « Sales Orders-header » — CR coaching, suivi étudiant) ou **via la table Soutenances**
  (évaluations/soutenances projet : map recordID soutenance → Commande lue en lecture seule),
  repli e-mail conservé. Différé : chaînes « Session Onboarding »/« Examen » (~220 soumissions). Normalisation
  enrichie : date de session (DatePicker), note = moyenne des **StarRating** (grilles jury),
  RecordPicker/FileUpload lisibles dans le corps. **Bug latent corrigé** : le write-back Airtable
  excluait pas les CR `source='fillout'` — or les formulaires Fillout créent déjà leur record dans
  Airtable → doublon assuré à l'activation du token write ; désormais filtré
  (`listPendingWritebackReports`, prouvé par test). **Incident sync corrigé au passage** : un
  changement d'e-mail côté Airtable (15/07) faisait échouer toute la sync quotidienne (violation
  d'unicité `airtable_record_id`) — désormais mis à jour **en place** (`emailUpdated`/`emailConflicts`
  tracés, conflit jamais fatal), prouvé par test contre la vraie `syncCommandes`.
  `tests/inc14` **7** (3 nouveaux) + `test:sync` **3** → **110/110**. **Actif en production** :
  2 139/2 222 soumissions historiques rattachées (610 en direct, 1 529 via Soutenances),
  1 449 notées (moyenne des étoiles), 278 dossiers apprenants alimentés ; 83 écartées-comptées
  (chaînes onboarding/certification différées).
- ✅ **INC-17** (vivier de talents — accès entreprises partenaires) : conviction produit
  « distanciel > présentiel grâce à la donnée » — les partenaires voient EN TEMPS RÉEL la
  progression, les évaluations (synthèse) et la disponibilité des candidats. Décisions :
  **nominatif avec consentement explicite** (tracé, révocable, écran apprenant « Visibilité
  entreprises ») ; **synthèse chiffrée seulement** (progression %, projets validés, note moyenne
  jury 360L, assiduité — jamais les commentaires internes) ; **dispo double** (statut coordination
  prioritaire + déclaratif apprenant : date, contrat, mobilité — règle pure `talent-rules.ts`).
  Schéma `0024` (enum `partner`) + `0025` : `partner_companies`, `memberships.partner_company_id`,
  `talent_profiles` (l'apprenant gère SA ligne par RLS ; `staff_status` verrouillé par trigger),
  vue **`talent_pool`** = seule surface partenaire (consentants, org courante, effacés RGPD exclus,
  colonnes vérifiées, grants stricts). Portail `(partner)/vivier` (tuiles, filtres, tableau) ;
  administration : création d'entreprises + invitation de comptes partner (rattachement société
  obligatoire) ; fiche apprenant : consentement + statut vivier. Effacement RGPD purge le profil
  vivier (+ ceinture `data_erasures` dans la vue). **Revue sécurité (3 bloquants corrigés et
  prouvés)** : annuaire `profiles` et créneaux `availabilities` fermés au rôle partner ; partner
  sans société de rattachement = aucun accès (action générique bloquée + vue exigeante + trigger
  de cohérence de tenant) ; **accountability RGPD** — chaque consultation du vivier est tracée
  dans `audit_log` (`talent_pool.view`). `test:talent` **12** (4 pur + 8 intégration :
  consentement/révocation, synthèse exacte, isolation inter-org et tables sous-jacentes, aucune
  écriture partenaire, trigger statut, annuaire verrouillé, audit, exclusion effacés) → **122/122**.
- ✅ **INC-18** (jobboard + besoins de formation) : ferme la boucle B2B ouverte par INC-17.
  **Offres d'emploi** : l'entreprise partenaire publie des offres → **modération par la
  coordination** (statut `pending`→`published`/`rejected`, machine à états `job-rules.ts` +
  trigger `protect_job_offer_moderation` — le partenaire ne se publie jamais lui-même) →
  visibles des apprenants. **Candidature en un clic** : l'apprenant marque son intérêt ; le
  partenaire voit les candidats via la vue `job_offer_candidates` = intersection intérêt ×
  consentement vivier (mêmes garanties qu'INC-17 : synthèse chiffrée, jamais e-mail/
  commentaires, effacés RGPD exclus, société propriétaire de l'offre). **Besoins de formation** :
  l'entreprise exprime les compétences/profils recherchés (`partner_training_needs`) — signal
  B2B remonté à la coordination pour orienter l'ingénierie pédagogique, jamais exposé aux
  apprenants (statut de suivi verrouillé par trigger). Écrans : `(partner)/offres` (+ détail
  candidats), `(partner)/besoins`, `mon-parcours/offres` (apprenant), `coordination/recrutement`
  (modération + suivi des besoins). Migration `0026` (RLS par rôle/société, 2 vues owner, 3
  triggers). **Revue sécurité (1 bloquant + 2 élevés corrigés et prouvés)** : éditer une offre
  publiée la refait passer en modération (le contenu validé n'est jamais substitué en douce) ;
  DELETE retiré au partenaire (pas de purge cascade des intérêts — retrait via `archived`) ;
  consultations candidats **journalisées** (`job_offer_candidates.view`) ; + cohérence de tenant
  (trigger), `security_barrier` sur les vues, bornes de longueur. `test:jobs` **11** (5 pur +
  6 intégration : modération + re-modération, isolation société/org, intérêt scoped, vue
  candidats consentants, DELETE refusé, audit, besoins verrouillés).
- ✅ **INC-19** (disponibilités des coachs et du jury) : lève le différé d'INC-4. Jusqu'ici
  `availabilities` n'était alimentée que par le miroir Cal.com, depuis un **compte hôte unique**
  et en écriture staff seulement : un coach ne pouvait pas publier ses créneaux, et le rôle
  `evaluator` n'avait **aucune surface applicative**. Solution hybride : **saisie native**
  (plages récurrentes `availability_rules` + exceptions `availability_blocks`, une fermeture
  l'emportant toujours sur une ouverture) **+ agenda externe en lecture seule** (`calendar_feeds`,
  iCalendar ; occupations dans `busy_periods` écrites par le job service-role). Règles **pures**
  `availability-rules.ts` (expansion des créneaux, fuseau Europe/Paris robuste au changement
  d'heure) et `calendar/ics.ts` (parseur minimal + **garde SSRF** : réseau interne et schémas
  non-http refusés). Écran « Mes disponibilités » partagé par le portail coach
  (`/disponibilites`) et le **nouveau portail jury** (`src/app/(evaluator)`, `/jury`). Cron
  `api/admin/sync-calendars` (06:00). Migration `0027`. **Confidentialité** : le lien d'agenda
  est un secret — `calendar_feeds` n'a délibérément aucune policy staff, et l'UI n'en affiche
  que l'hôte. **Correctif de conception** : `getAvailabilities` renvoyait tous les créneaux de
  l'organisme — sans garde-fou, un apprenant se serait vu proposer le coach de quelqu'un
  d'autre ; les créneaux `self:` sont désormais filtrés par coach référent
  (`filterBookableSlots`), ceux du miroir `cal:` restent ouverts. Les rendez-vous déjà pris
  masquent les créneaux (coaching via `coach_email`, soutenances via `reservation_evaluators`).
  `test:availability` **29** (20 pur + 9 intégration : usurpation d'hôte refusée, cloisonnement
  entre coachs, apprenant non autorisé, agenda invisible du staff, `busy_periods` service-role
  only, isolation inter-org, reprise en main par la coordination).
  **Différé** : développement des récurrences (RRULE) des agendas externes ; horizon de
  publication fixé à 60 jours.
- ✅ **INC-20** (« Mon parcours » conforme au CDC, P.A1) : l'écran d'accueil de l'apprenant
  était quasi vide — il n'y trouvait aucune des informations que le cahier des charges lui
  promet. Il porte désormais l'**en-tête de dossier** (programme, spécialité, statut, dates de
  début et de fin, fin d'accès, coach référent), la **progression** (barre accessible
  `role="progressbar"` avec valeurs ARIA, projets validés / requis, livrables déposés, jours
  de retard, badge et note jury par projet), les **prochains rendez-vous** (« À confirmer » /
  « Confirmé ») et des **alertes** ordonnées par urgence. Règles pures `journey-rules.ts`
  (`buildJourneyAlerts` : fin d'accès à 30 j puis 7 j, échéance à 3 j, réservation en attente,
  pièces manquantes actionnables ; un dossier terminé fait taire les alertes ; `progressPercent`
  accepte les deux échelles 0–1 et 0–100 rencontrées dans les données réelles). Accès aux
  données `data/learner-journey.ts` sous RLS. `test:journey` **9**.
- ✅ **INC-21** (recherche d'apprenant) : les écrans-listes ne se parcouraient qu'au filtre ;
  retrouver une personne nommée imposait de dérouler des centaines de lignes. Champ de
  recherche libre (nom, prénom, e-mail) sur la liste coordination et sur le portefeuille coach,
  via la primitive `FilterSearch` (même rendu serveur pur que le reste de `FilterBar`). Règles
  pures `search-rules.ts` : le terme est **assaini** — les caractères qui altèrent la grammaire
  de filtre PostgREST (virgule, parenthèses, guillemets, `%`, `_`, `*`, `:`) sont neutralisés,
  ce qui interdit d'élargir la requête depuis l'URL — borné à 80 caractères et ignoré en deçà
  de 2. Jointure en `!inner` dès qu'un terme est posé (la jointure doit filtrer, pas seulement
  enrichir) et `.or(..., { referencedTable })`. La **RLS reste le garde-fou** : un coach ne peut
  rien trouver hors de son portefeuille, la recherche ne fait que réduire un ensemble déjà
  cloisonné. `test:search` **6** ; résistance à l'injection de filtre vérifiée sur la base réelle.
- ✅ **INC-22** (direction visuelle « Poste de pilotage » + contraste prouvé) : la direction
  épurée livrée en #28 était jugée générique, sans caractère et peu lisible. Trois directions
  ont été maquettées sur des écrans réels **à charte figée** (mêmes couleurs, mêmes polices,
  seule leur application change) ; la direction retenue fait du navy **l'environnement** des
  rôles qui opèrent — rail sombre, plan de travail clair — rend le rouge à son rôle de
  **signal**, et greffe dans la zone de contenu l'échelle typographique de la direction
  « Registre » (chiffres de synthèse en grand, libellés en petites capitales espacées, filets
  fins, aucune boîte superflue). **Coque par famille de rôle** (`AppShell tone`) : `navy` pour
  coordination/coach/jury, `light` pour apprenant/entreprise partenaire — un apprenant en
  formation n'a pas à se retrouver dans un poste de conduite, et la coque colorée sera le
  support naturel de la marque d'un autre organisme à l'**étape 7**. L'item de nav actif porte
  **trois marques simultanées** (fond, filet rouge, `aria-current`) : l'état n'est jamais porté
  par la seule couleur.
  **Jetons unifiés** : `src/lib/design-tokens.ts` devient la source de vérité unique, importée
  par `tailwind.config.ts` **et** auditée par les tests — une couleur écrite en dur ailleurs
  échapperait à la preuve de contraste.
  **Contraste prouvé, pas déclaré** : `contrast-rules.ts` (pur, sans import, WCAG 2.1) et
  `CHARTE_TEXT_PAIRS` recalculent toute combinaison texte/fond que l'interface garantit ;
  `npm run test:design` échoue si l'une descend sous AA. Le test a **trouvé deux défauts réels
  et non théoriques** : `warning #B8860B` mesurait 3,25:1 sur blanc et était **déjà en
  production sur quatre écrans** (exploitation, conformité, notifications, mon-parcours), et
  `success #2E7D32` tombait à 4,47:1 sur sa propre teinte. Variantes `-ink` ajoutées, usages
  corrigés. L'accessibilité étant un argument commercial auprès des financeurs publics, ce test
  est la pièce d'audit : il se rejoue à l'identique.
  Nouvelles primitives `StatTile`/`StatGrid` (bande de synthèse en tête d'écran-liste, chiffres
  décrivant la **sélection affichée**) et colonnes `numeric` (`tabular-nums`) sur `Th`/`Td` ;
  règles pures `list-summary-rules.ts` (un avancement inconnu est **exclu** de la moyenne, pas
  compté pour zéro). `test:design` **17** (11 contraste + 6 synthèse).
  **Vérifié en réel** : rendu de `coordination/apprenants` sous session staff — coque navy,
  marqueur actif, tuiles alimentées par les dossiers réels.
  **Écran de connexion repris** : premier écran vu par tous les rôles, il vit hors de l'app shell
  et n'héritait donc d'aucune coque. Il la reconstitue en deux panneaux (navy identitaire à
  gauche, plan de travail clair à droite), sans élément focusable côté navy — l'anneau de focus
  global est en navy et y serait invisible.
  **Vrai logo `pro/club`** : le carré « SC » n'était qu'un substitut, et le logo n'existait dans
  aucun fichier du dépôt. D'abord extrait de la présentation PDF, puis regénéré depuis la **source fournie par la
  direction** (PNG 1182 px, alpha propre). Décliné en quatre PNG détourés (`{shield,lockup}` × `{white,navy}`) plus un favicon — l'application n'en avait aucun.
  Chaque ton a son fichier plutôt qu'une recoloration CSS, pour qu'un masque défaillant ne laisse
  jamais un aplat plein à la place du logo. 92 Ko au total, à remplacer par une source
  vectorielle si elle existe.
  **Différé** : migration des écrans restants vers l'échelle typographique (les primitives la
  portent déjà, les écrans en héritent) ; bascule confort/compact sur les écrans-listes.
- ✅ **INC-23** (accueil : portail par rôle + cohérence visuelle) : l'accueil, première URL du
  produit, était resté à l'écart de la refonte et détonnait à côté de la connexion. Il adopte la
  même silhouette en deux panneaux. **Il portait surtout un vrai défaut fonctionnel** : tout
  compte connecté se voyait proposer `/mon-parcours`, le portail apprenant — un coach, un membre
  du jury, la coordination ou une entreprise partenaire atterrissait donc sur une route que sa
  garde de rôle refuse. Corrigé par une table `ROLE_HOME` et la règle pure `homeHrefForRoles`
  (`src/lib/roles.ts`) : le rôle **le plus large** décide, parce qu'un coach est souvent aussi
  évaluateur et que le portail jury est plus étroit que le sien. Deux cas limites traités
  explicitement au lieu d'un lien mort : domaine sans organisme résolu, et compte sans aucun rôle
  dans l'organisme. `test:roles` complété de **6** tests purs (couverture de tous les rôles,
  arbitrage multi-rôles, absence de rôle).
- ✅ **INC-25** (fraîcheur des données) : « peut-on avoir du temps réel ? ». Deux notions se
  cachaient derrière : la **fraîcheur** (à quel point la donnée est récente) et la **réactivité**
  (l'écran se met à jour sans rafraîchir). Le goulot était la fraîcheur — la donnée naît dans
  Airtable et la synchronisation ne passait qu'une fois par jour. Brancher Supabase Realtime
  par-dessus n'aurait rien gagné : l'écran aurait réagi instantanément à un changement quotidien.
  Mesure préalable : un passage complet dure **33 s** (537 commandes + 2 264 soumissions Fillout),
  très en deçà des quotas Airtable (5 req/s par base). D'où le workflow
  **`sync-airtable-quarterly`** — GitHub Actions **toutes les 15 minutes**, le plan Vercel Hobby
  n'autorisant que du quotidien — avec `concurrency` pour interdire deux passages simultanés qui
  se disputeraient les mêmes lignes. Le cron Vercel de 5 h reste un filet. **Fraîcheur ramenée de
  24 h à 15 min.**
  **Bouton « Synchroniser maintenant »** sur l'écran Exploitation, pour le cas « je viens de
  corriger une commande dans Airtable » : action serveur derrière garde direction/coordinator, le
  client service-role n'étant construit **qu'après** la garde ; déclenchement journalisé avec son
  auteur ; cadencé à 4 par 15 min et par organisme — ce cadrage vise le coût, pas la sécurité,
  l'action étant déjà gardée. `revalidatePath` sur les écrans-listes, faute de quoi le rendu
  serveur resterait sur l'ancienne donnée malgré la mise à jour.
  La séquence de synchronisation est extraite dans `src/lib/sync/pipeline.ts` et partagée par le
  cron et le bouton : la dupliquer aurait garanti qu'ils divergent.
  **Écartés, avec leurs raisons** : *Supabase Realtime* (aucun gain tant que la donnée ne bouge
  qu'à la synchronisation ; à reconsidérer pour les écrans où deux personnes agissent en même
  temps, affectation du jury et modération d'offres) ; *webhooks Airtable* (vrai push, mais
  endpoint public, enregistrement à renouveler tous les 7 jours et gestion de curseur — à
  reprendre seulement si 15 minutes ne suffisent pas).
  **Prochaine étape : Étape 7** (ouverture à d'autres organismes).

Suite `main` : **branche → PR → CI verte → merge → déploiement** (previews Vercel actifs).

## Principes d'accélération
- **Lots plus gros** : un incrément = un module entier ou un chantier cohérent, pas
  une micro-tâche.
- **Toujours vert** : chaque incrément ajoute ses tests (unitaires + intégration RLS
  quand la donnée est concernée) et ne passe pas tant que tout n'est pas vert.
- **Ne jamais casser l'acquis** : l'isolation inter-organismes et les invariants de
  réservation restent verts à chaque incrément (tests de non-régression).
- **Valider sur staging** : chaque incrément est déployé et vérifié sur l'URL en ligne.
- **RLS d'abord** : toute nouvelle table porte `org_id` + policies, jamais un simple
  filtre d'affichage.

## Recommandation de déploiement
Déployer un **staging dès maintenant** (INC-0). Raisons : les liens d'authentification
par e-mail et les cookies exigent une vraie URL ; on révèle tôt les problèmes
d'environnement ; on teste chaque incrément en conditions réelles. Vercel région UE +
Supabase UE. Ta seule action : créer le compte Vercel et autoriser le déploiement,
Claude Code te guide. Secrets dans les variables d'environnement Vercel, jamais au dépôt.

---

# Séquence d'incréments

## INC-0 — Mise en ligne (staging) + CI/CD + cron du miroir
**Objectif** : une URL en ligne, sécurisée, où l'app tourne et où l'authentification
par e-mail fonctionne ; le miroir des créneaux Cal.eu tourne automatiquement.
**Périmètre** : déploiement Vercel (UE), variables d'environnement et secrets, URLs de
redirection Supabase (auth), domaine de test, planification cron de
`POST /api/admin/mirror-availabilities`, pipeline CI qui bloque le merge si typecheck
ou tests échouent.
**Critères d'acceptation** : l'app est accessible en ligne ; connexion par lien e-mail
de bout en bout ; le cron alimente `availabilities` ; la CI est verte et bloquante.

### Brief à coller
```
INC-0 : mets en ligne un staging et automatise le miroir.
1. Guide-moi pour créer le projet Vercel (région UE) et connecter le dépôt.
2. Reporte toutes les variables d'environnement (Supabase, Cal.eu, CRON_SECRET,
   APP_BASE_DOMAIN) dans Vercel ; rien au dépôt.
3. Configure les URLs de redirection d'auth Supabase pour le domaine de staging ;
   vérifie la connexion par lien e-mail en ligne.
4. Planifie le miroir des créneaux (cron) sur POST /api/admin/mirror-availabilities.
5. Rends la CI bloquante (typecheck + tests) sur la branche principale.
DoD : app en ligne, login e-mail OK en ligne, cron actif, CI verte et bloquante.
Contraintes habituelles : aucun secret au dépôt, isolation et réservation restent vertes.
```

## INC-1 — Données réelles : synchronisation Airtable vers Postgres
**Objectif** : travailler sur les vrais dossiers SproCLUB ; tout l'aval en bénéficie.
**Périmètre** : adapter le script `../sync_cible` (mapping déjà spécifié) pour écrire
dans Postgres (`learners_ro`, `enrollments_ro`, référentiel), en respectant `org_id`
SproCLUB et la normalisation e-mail ; job planifié ; journal de synchro.
**Dépendances** : INC-0. **Critères** : les dossiers réels apparaissent dans la
plateforme, reliés à leur apprenant et programme ; relançable sans doublon (idempotent) ;
aucun impact sur la base Airtable.

### Brief à coller
```
INC-1 : synchronise Airtable vers Postgres pour l'organisme SproCLUB.
Réutilise le mapping de ../sync_cible (Apprenants, Dossiers, Référentiel) mais écris
dans Postgres au lieu des tables CIBLE Airtable. Upsert idempotent par email normalisé
(apprenant) et par id source (dossier) ; rattache tout à l'org SproCLUB ; journal de
synchro ; job planifié. Ne touche pas la base Airtable (lecture seule).
DoD : dossiers réels visibles dans /mon-parcours et l'admin, sync relançable sans
doublon, test d'intégration de la synchro vert. Isolation et réservation restent vertes.
```

## INC-2 — Espace administration, socle : référentiel + dossier apprenant
**Objectif** : le cockpit que toi et le coordinateur utilisez.
**Périmètre** : Module 4 (catalogue programmes / spécialités / parcours, règles de
publication) et Module 2 complet (liste apprenants filtrable S2.1 + fiche apprenant 360
S2.2). Gardes de route `direction`/`coordinator`.
**Dépendances** : INC-1. **Critères** : créer un programme sans code ; la fiche apprenant
affiche ses sections sur données réelles ; filtres programme/spécialité/statut/financeur ;
un coach ne voit que ses apprenants.

### Brief à coller
```
INC-2 : espace administration, socle. Implémente le Module 4 (référentiel programmes,
spécialités, parcours + règles de publication) et le Module 2 complet (liste apprenants
filtrable S2.1 + fiche apprenant 360 S2.2), gardés par direction/coordinator. Données
réelles via INC-1. Respecte le cahier des charges (SPROPULSE/CDC) et le dictionnaire.
DoD : création de programme sans code ; fiche apprenant complète en données réelles ;
filtres opérationnels ; tests RLS de rôle verts ; non-régression isolation/réservation.
```

## INC-3 — Opérations pédagogiques (Module 1) ✅ livré (S1.1 ; S1.2 planning + S1.3 serveurs SAP différés faute de données synchronisées)
**Objectif** : la conduite quotidienne du coordinateur.
**Périmètre** : file de tâches priorisée S1.1 (soutenances à venir, CR en attente,
serveurs à libérer, retards), planning et affectations S1.2 (règle d'indépendance),
ressources SAP S1.3.
**Dépendances** : INC-2. **Critères** : la file remonte les actions triées par urgence ;
impossible d'affecter le coach comme évaluateur de son apprenant ; alerte fin d'accès à 30 jours.

### Brief à coller
```
INC-3 : Module 1 Opérations. File de tâches priorisée S1.1, planning et affectations
S1.2 (règle d'indépendance coach != évaluateur), ressources SAP S1.3. Gardes
coordinator/direction. Conforme au CDC.
DoD : file triée par urgence, refus d'affectation coach=évaluateur, alerte fin d'accès
30 jours, tests verts, non-régression.
```

## INC-4 — Portail coach + boucle réservation complète (Étape 3) ✅ livré (portail + CR + invités jury Cal.eu ; remontée Airtable des CR + dispos multi-coach différées)
**Objectif** : outiller les intervenants et fermer la boucle réservation.
**Périmètre** : portail coach (ses apprenants : avancement, planning, soutenances,
documents), saisie des comptes rendus et notes, publication des disponibilités (deux
calendriers) ; ajout des deux évaluateurs comme invités Cal.eu à la confirmation du jury.
**Dépendances** : INC-2. **Critères** : un coach n'accède qu'à ses apprenants ; ses
saisies remontent ; ses disponibilités alimentent le miroir ; à la confirmation d'une
soutenance, les deux évaluateurs sont invités sur l'événement Cal.eu.

### Brief à coller
```
INC-4 : portail coach (Étape 3) + invités jury Cal.eu. Le coach voit ses seuls
apprenants (avancement, planning, soutenances, documents), saisit CR et notes, publie
ses disponibilités coaching et soutenance. À la confirmation d'une soutenance, ajoute
les deux évaluateurs comme invités de l'événement Cal.eu. Respecte l'indépendance.
DoD : périmètre coach étanche (test RLS), saisies visibles côté admin, disponibilités
miroir OK, invités jury présents sur Cal.eu, tests verts, non-régression.
```

## INC-5 — Conformité (Module 3) + Pilotage direction (Module 0) ✅ livré (S3.1 complétude + S0.1 pilotage ; S3.2/S3.3 couverts par KPIs + filtre CPF)
**Objectif** : protéger l'organisme en audit et donner la vue de tête.
**Périmètre** : complétude des dossiers S3.1, indicateurs réglementaires S3.2, dossiers
CPF prioritaires S3.3 ; accueil direction hiérarchisé S0.1 (alertes en tête, résultats
avec effectifs, dossiers à risque, activité).
**Dépendances** : INC-1, INC-2. **Critères** : taux de complétude calculé sur les pièces
obligatoires ; dossiers terminés non conformes en rouge ; chaque taux affiche son effectif.

### Brief à coller
```
INC-5 : Module 3 Conformité (complétude S3.1, indicateurs réglementaires S3.2, CPF S3.3)
et Module 0 Pilotage direction (accueil hiérarchisé S0.1, alertes en tête). Chaque taux
affiche son effectif ; dossier terminé non conforme signalé. Conforme au CDC et au plan
de recette.
DoD : complétude correcte (ex. 3/5 = 60%), alertes conformité visibles, effectifs
affichés, tests verts, non-régression.
```

## INC-6 — Indicateurs et reporting (Module 5) ✅ livré (tableaux segmentables + export CSV daté + cron périodique ; volet économique différé faute de données de coûts)
**Objectif** : chiffres fiables et déclarations officielles.
**Périmètre** : tableaux de bord activité et résultats (par programme, spécialité,
financeur, période), volet économique, exports réglementaires (BPF, bilan) et export
périodique automatisable.
**Dépendances** : INC-2, INC-5. **Critères** : indicateurs recalculés cohérents avec un
contrôle manuel ; export daté généré ; export périodique planifiable.

### Brief à coller
```
INC-6 : Module 5 Indicateurs et reporting. Tableaux de bord activité et résultats
segmentables, volet économique, exports réglementaires (BPF/bilan) + export périodique
automatisable. Chaque indicateur avec son effectif.
DoD : recomputation manuelle sur un échantillon = valeur affichée, export daté OK,
export périodique planifié, tests verts, non-régression.
```

## INC-7 — Notifications et relances ✅ livré (pipeline relances e-mail + journal + opt-out + anti-doublon)
**Objectif** : remplacer progressivement les automatisations Airtable de relance.
**Périmètre** : notifications e-mail (confirmations et rappels de rendez-vous, relances
CR, échéances CPF, fin d'accès serveur), avec préférences et journal d'envoi.
**Dépendances** : INC-3, INC-4. **Critères** : les relances clés partent automatiquement ;
journal consultable ; pas de doublon avec les automatisations Airtable encore actives.
**Livré** : `0021` (`notifications` + `notification_prefs`), `src/lib/notification-rules.ts` (pur),
`src/lib/notifications/mailer.ts` (port + adaptateur Resend, dégradation propre), `src/lib/data/
notifications.ts` (calcul/enqueue/dispatch/journal, injectables), cron `/api/admin/run-notifications`,
écran `coordination/notifications`, anti-doublon via `NOTIF_DISABLED_KINDS`. `test:notifications` 8.
**Pause credential** : `RESEND_API_KEY` + `NOTIF_FROM` pour l'envoi réel. **Différé** : échéances CPF
(champ absent du modèle de données) ; confirmations événementielles à la réservation.

### Brief à coller
```
INC-7 : notifications et relances par e-mail (confirmations et rappels de rendez-vous,
relances comptes rendus, échéances CPF, fin d'accès serveur), avec journal d'envoi.
Coordonne avec les automatisations Airtable existantes pour éviter les doublons.
DoD : relances clés automatiques, journal consultable, pas de doublon, tests verts.
```

## INC-8 — Espace apprenant complet (Mon dossier) ✅ livré (résultats/insertion/documents + Storage isolé par org & apprenant)
**Objectif** : compléter le portail apprenant au-delà du parcours et de la réservation.
**Périmètre** : écran « Mon dossier » (P.A2) — documents (attestations, convention,
certificat) via Supabase Storage cloisonné par organisme, résultats (notes,
certification, insertion), et réponse aux questionnaires. Téléchargement des attestations,
dépôt de livrables déjà en place.
**Dépendances** : INC-1, INC-2. **Critères** : l'apprenant voit et télécharge ses seuls
documents ; ses résultats et son insertion s'affichent ; le stockage est isolé par organisme.

### Brief à coller
```
INC-8 : espace apprenant complet. Implémente l'écran « Mon dossier » (P.A2) : documents
(attestations, convention, certificat) via Supabase Storage cloisonné par org_id,
résultats (notes, certification, insertion), accès aux questionnaires. Politiques Storage
par organisme (un apprenant n'accède qu'à ses fichiers).
DoD : documents/résultats visibles pour le seul intéressé, Storage isolé (test), tests
verts, non-régression isolation/réservation.
```

## INC-9 — Génération de documents ✅ livré (PDF attestations/convention/convocation + journal d'émission + archivage Storage)
**Objectif** : produire les documents Qualiopi par apprenant, aujourd'hui dans Airtable.
**Périmètre** : gabarits et génération PDF des attestations d'entrée et de fin, de la
convention, de la convocation de soutenance ; stockage dans Storage ; horodatage et
journal d'émission.
**Dépendances** : INC-2, INC-8. **Critères** : chaque document se génère avec les bonnes
données du dossier ; il est archivé et retrouvable ; conforme aux mentions obligatoires.

### Brief à coller
```
INC-9 : génération de documents (PDF). Attestations d'entrée et de fin, convention,
convocation de soutenance, à partir de gabarits et des données du dossier. Archive dans
Supabase Storage, journal d'émission. Remplace progressivement les éditeurs Airtable.
DoD : documents générés avec les bonnes données, archivés et retrouvables, mentions
obligatoires présentes, tests verts.
```

## INC-10 — Gestion des utilisateurs et des rôles ✅ livré
**Objectif** : administrer les comptes en production sans passer par la base.
**Périmètre** : inviter et désactiver des utilisateurs (direction, coordinateur, coach,
évaluateur, apprenant), gérer leurs `memberships` et rôles, et administrer le vivier
d'évaluateurs par programme. Réservé à direction et coordinateur.
**Dépendances** : INC-2. **Critères** : inviter un coach lui ouvre l'accès à ses seuls
apprenants ; désactiver un compte coupe l'accès ; le vivier alimente l'affectation du jury.

### Brief à coller
```
INC-10 : gestion des utilisateurs et des rôles (écran admin, direction/coordinator).
Inviter et désactiver des utilisateurs, gérer memberships et rôles par organisme,
administrer le vivier d'évaluateurs par programme. Provisioning avec le claim
app_metadata.org_id cohérent.
DoD : invitation/désactivation fonctionnelles, périmètres respectés (test RLS), vivier
utilisable par la coordination, tests verts, non-régression.
```

## INC-11 — RGPD et journal d'audit ✅ livré (audit des accès + export + droit à l'oubli avec anti-réimport)
**Objectif** : tenir les obligations légales sur les données personnelles des étudiants.
**Périmètre** : journal d'audit des accès aux dossiers apprenants, export des données
personnelles d'une personne, effacement (droit à l'oubli) avec anonymisation maîtrisée,
politique de rétention documentée.
**Dépendances** : INC-2. **Critères** : chaque accès à un dossier est tracé ; une demande
d'export produit les données de la personne ; un effacement est possible sans casser
l'intégrité référentielle.
**Livré** : `0017` (audit_log/log_access, data_erasures/is_erased) + `0018`/`0019` (lockdown
service-role de is_erased), `src/lib/data/rgpd.ts`, `src/lib/rgpd-rules.ts` (règle pure
`decideAccountErasure`), section RGPD sur la fiche apprenant, `RETENTION.md`, `test:rgpd` 10/10.

### Brief à coller
```
INC-11 : RGPD et journal d'audit. Trace des accès aux dossiers apprenants, export des
données personnelles d'une personne, effacement (droit à l'oubli) avec anonymisation,
rétention documentée. Cohérent avec la RLS et l'hébergement UE.
DoD : accès tracés, export et effacement opérationnels sans casser l'intégrité, tests
verts, non-régression.
```

## INC-12 — Exploitation et observabilité ✅ livré (journal d'exploitation + rate limiting + purge + runbook)
**Objectif** : fiabiliser l'exploitation d'un produit en production.
**Périmètre** : surveillance des erreurs (alerting), limitation de débit sur les points
d'entrée publics (login, miroir), sauvegardes vérifiées et restauration testée, rotation
des secrets (dont la clé Cal.com), runbook d'incident.
**Dépendances** : INC-0. **Critères** : une erreur serveur est remontée ; un abus sur le
login est freiné ; une restauration de sauvegarde est prouvée ; la rotation de clé est documentée.
**Livré** : `0020` (`ops_events` + `rate_limit_events`/`rate_limit_touch`), `src/lib/data/ops.ts`,
`src/lib/ratelimit-rules.ts` (pur), rate limiting du login + logs des routes publiques, écran
`coordination/exploitation`, cron `/api/admin/purge-retention` (purge de rétention automatisée,
finit le différé INC-11), alerting webhook optionnel, `RUNBOOK.md` (incident, sauvegarde/
restauration testée, rotation des secrets Cal.eu/Airtable/service-role/`CRON_SECRET`),
`RETENTION.md` mis à jour. `test:observability` **6** (3 pur + 3 intégration). **Différé** :
exécution réelle du test de restauration en staging (procédure documentée) ; SMTP dédié (Resend).

### Brief à coller
```
INC-12 : exploitation et observabilité. Monitoring d'erreurs + alerting, rate limiting
sur login et endpoints publics, sauvegardes vérifiées + test de restauration, rotation
des secrets (Cal.com), runbook d'incident.
DoD : erreurs remontées, abus login freiné, restauration prouvée, rotation documentée.
```

## INC-13 — Accessibilité et mobile ✅ livré (app shell accessible + responsive + a11y de base vert)
**Objectif** : des portails utilisables au téléphone et accessibles.
**Périmètre** : mise en responsive des portails apprenant et coach, passe d'accessibilité
(contrastes, navigation clavier, libellés), vérification sur mobile.
**Dépendances** : INC-4, INC-8. **Critères** : les parcours clés sont utilisables sur
mobile ; les vérifications d'accessibilité de base passent.
**Livré** : lien d'évitement + `main#main-content` focusable, `NavTabs` (client, `aria-current` +
état actif visible), viewport explicite (zoom autorisé), cibles ≥44px, `Th scope="col"` ; tables
responsives (primitive) et grilles adaptatives déjà en place. Règle pure `nav-active.ts` (`test:nav` 5).
Vérif : `next lint` (jsx-a11y) vert, contrôle axe-core ponctuel (0 violation WCAG 2 A/AA, manuel — non en
CI), pas de débordement horizontal, non-régression **86/86**.

### Brief à coller
```
INC-13 : accessibilité et mobile. Rends les portails apprenant et coach responsive,
passe d'accessibilité (contrastes, navigation clavier, libellés ARIA), vérifie les
parcours clés sur mobile.
DoD : parcours clés utilisables sur mobile, checks d'accessibilité de base au vert.
```

---

## INC-15 — Pont 360Learning (livrables de projet) ✅ livré (activation en attente des env Vercel)
Contrainte métier : les apprenants déposent leurs livrables sur 360Learning et le **jury**
évalue/valide ; la validation débloque le projet suivant (mécanique native des parcours
360L, non pilotable par API — vérifié : l'API v2 n'expose ni les fichiers soumis ni
d'écriture de validation). La plateforme se synchronise donc en LECTURE, toutes les heures :
mapping parcours « Projet n°X » → n° de projet (auto-découverte + ajustable), dépôt détecté
par la clôture de la tentative sur le cours de rendu (débloque la soutenance côté
plateforme), validation jury détectée par le statut `successful` du parcours (`validated_at`
+ score). Jointure par e-mail, skip-list RGPD, idempotent, comptage explicite des écartés.
DoD : tests pur + intégration verts (RLS, idempotence, RGPD), migration 0023 appliquée,
cron horaire actif, badges jury sur portail et dossier coach.

---

## Après le produit interne
Une fois INC-0 à INC-13 livrés et éprouvés à SproCLUB, l'étape 7 ouvre la plateforme à
d'autres organismes : onboarding par paramétrage, image de marque et domaine par
organisme, audit de sécurité externe, puis ouverture commerciale. Le socle multi-locataire
étant déjà en place, c'est une extension, pas une refonte.

## Ordre recommandé
En tête de file, toujours : INC-0 (mise en ligne) puis INC-1 (données réelles), qui
débloquent tout le reste.

Ensuite le socle d'usage : INC-2 (administration socle), puis INC-10 (gestion des
utilisateurs, indispensable dès qu'on onboarde de vrais comptes), puis INC-3 (opérations)
et INC-4 (portail coach + boucle réservation).

Puis la valeur apprenant et la conformité : INC-8 (espace apprenant complet), INC-9
(génération de documents), INC-5 (conformité et pilotage), INC-6 (reporting).

Avant d'ouvrir largement à de vrais étudiants, traiter les fondations d'exploitation :
INC-11 (RGPD et audit) et INC-12 (exploitation et observabilité), puis INC-7
(notifications) et INC-13 (accessibilité et mobile) en finition.

Résumé de la séquence : 0, 1, 2, 10, 3, 4, 8, 9, 5, 6, 11, 12, 7, 13. Les paires 3/4,
5/6 et 11/12 peuvent se réordonner selon l'urgence, mais INC-0 et INC-1 restent en tête,
et INC-11 et INC-12 doivent précéder l'ouverture à un vrai public d'étudiants.
