# Structure du code

Carte fichier par fichier de `src/`. **Extrait de `CLAUDE.md` le 2026-08-01** pour
alleger le contexte charge a chaque session : cette carte est reconstructible avec
`ls -R src/`, et elle se perime a chaque refactor. Les regles non devinables qui y
etaient noyees ont ete remontees dans `CLAUDE.md`.

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
- `src/lib/availability-rules.ts` (INC-19, pur : expansion des plages récurrentes en créneaux,
  fermeture prioritaire sur ouverture, fuseau Europe/Paris robuste au changement d'heure) +
  `src/lib/calendar/ics.ts` (port pur : parseur iCalendar minimal + garde SSRF) +
  `src/lib/calendar/sync.ts` (job service-role : flux → `busy_periods` → republication) +
  `src/lib/data/availability.ts` (CRUD RLS des plages/exceptions/agenda, publication `self:%`).
  Écran « Mes disponibilités » partagé (`src/components/availability/*`) monté dans le portail
  coach (`/disponibilites`) et le **nouveau portail jury** (`src/app/(evaluator)`, `/jury`).
  Cron `api/admin/sync-calendars`. Migration `0027` : `availability_rules` (récurrence hebdo),
  `availability_blocks` (exceptions open/closed), `calendar_feeds` (URL d'agenda — **lisible par
  son seul propriétaire, le staff n'y accède pas**), `busy_periods` (occupations, écriture
  service-role) ; `availabilities_own_manage` ouvre la publication au titulaire.
- `src/lib/journey-rules.ts` (INC-20, pur : alertes de parcours ordonnées par urgence,
  `progressPercent` tolérant aux deux échelles 0–1 / 0–100) + `src/lib/data/learner-journey.ts` ;
  écran `mon-parcours` (P.A1).
- `src/lib/search-rules.ts` (INC-21, pur : assainissement du terme contre l'injection de filtre
  PostgREST, `buildIlikeOr`) ; recherche câblée dans `data/admin-learners.ts` et `data/coaching.ts`
  via la primitive `FilterSearch`.
- `src/lib/design-tokens.ts` (INC-22) — **source de vérité unique des couleurs**, importée par
  `tailwind.config.ts` et auditée par les tests ; `CHARTE_TEXT_PAIRS` déclare toute combinaison
  texte/fond garantie AA. `src/lib/contrast-rules.ts` (pur, sans import, WCAG 2.1 : luminance
  relative, rapport de contraste, seuils AA). `src/lib/list-summary-rules.ts` (pur : synthèse
  d'une sélection de dossiers, avancement inconnu exclu de la moyenne).
  Coque à deux tons dans `src/components/sidebar.tsx` (`ShellTone` navy/light) ; primitives
  `src/components/ui/stat.tsx` (`StatTile`/`StatGrid`).
- `supabase/migrations/0001` → `0027` ; seed `supabase/seed/sproclub_bootstrap.sql`.
  (`0004` invariants réservation, `0005` normalisation e-mails minuscules à l'écriture,
  `0012` gestion utilisateurs/rôles : désactivation qui coupe l'accès + policies de gestion,
  `0013` `enrollments_ro.pending_reports` pour la file d'opérations, `0014` portail coach :
  périmètre coach resserré (RLS) + table `coaching_reports`, `0016` `document_emissions`,
  `0017` RGPD (`audit_log`/`log_access`, `data_erasures`/`is_erased`), `0018`/`0019` lockdown `is_erased`,
  `0020` exploitation (`ops_events` + `rate_limit_events`/`rate_limit_touch`),
  `0021` notifications (`notifications` + `notification_prefs`).)

