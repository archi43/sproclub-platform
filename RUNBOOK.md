# Runbook d'exploitation — SproCLUB Platform

Guide d'exploitation de la plateforme en production (INC-12). Complète `RETENTION.md`
(rétention/RGPD) et le « État actuel » de `CLAUDE.md`. Hébergement **UE** : Supabase
`eu-north-1` + Vercel `fra1`.

## 1. Observabilité et alerting
- **Journal d'exploitation** : table `ops_events` (org_id + RLS ; lecture direction/
  coordinator). Écrite côté serveur (service role) par les routes, l'action de connexion
  et les crons. Niveaux `info` / `warn` / `error`.
- **Écran** : `coordination/exploitation` — tuiles (erreurs 24 h / 7 j, alertes), filtre
  par niveau, table horodatée (fuseau Europe/Paris).
- **Ce qui est remonté** : échecs des crons (sync, miroir, export BPF, purge), échec
  d'envoi du lien de connexion, dépassement de débit au login, tentatives d'accès non
  autorisées sur les endpoints protégés.
- **Alerting externe (optionnel, sans secret au dépôt)** : définir la variable d'env
  `OPS_ALERT_WEBHOOK` (Vercel) vers un webhook entrant (Slack, etc.). Tout événement
  `error` y est poussé en best-effort (POST JSON `{ text, level, source, detail }`,
  timeout 3 s). Non défini ⇒ pas d'appel externe.
- **Erreurs applicatives** : les `error` sont aussi émises sur la console serveur (visible
  dans les logs Vercel : `vercel logs` / dashboard).

## 2. Rate limiting (points d'entrée publics)
- **Mécanisme** : fonction `rate_limit_touch(bucket, key, window_seconds, max)` (SECURITY
  DEFINER, service-role only) + table verrouillée `rate_limit_events`. Fenêtre glissante,
  auto-nettoyante. Clé = IP client (`x-forwarded-for` → `x-real-ip` → `unknown`).
- **Réglages** (`src/lib/ratelimit-rules.ts`) :
  - `login` : 5 requêtes / 15 min / IP (anti-énumération, anti-mailbomb).
  - `public-probe` : 20 / min / IP (borne le volume de logs sur endpoints protégés).
- **Tuning** : ajuster `max` / `windowSeconds` dans `ratelimit-rules.ts` puis redéployer.
- **Fail-safe** : si le limiteur est indisponible, la connexion est **autorisée**
  (disponibilité) et l'incident est loggé — jamais de blocage des utilisateurs légitimes.

## 3. Sauvegardes et restauration
- **Sauvegardes** : Supabase réalise des sauvegardes automatiques quotidiennes ; le
  Point-In-Time Recovery (PITR) dépend du plan. Vérifier/activer dans
  *Supabase → Project → Database → Backups*.
- **Procédure de restauration testée** (à exécuter sur un projet/branche jetable, jamais
  d'abord en prod) :
  1. Créer un projet Supabase de test (même région UE) ou une *branch*.
  2. Restaurer la dernière sauvegarde (ou un point PITR) sur ce projet.
  3. Appliquer les migrations manquantes : `supabase db push` (linké au projet de test).
  4. Vérifier l'intégrité : lancer la suite d'intégration contre ce projet
     (`.env.local` pointant dessus) — `npm test` doit être vert (RLS + invariants).
  5. Journaliser la vérification (date, point restauré, résultat) ci-dessous.
- **Dernière vérification de restauration** : _à renseigner lors de la première exécution_
  (date · point restauré · `npm test` vert O/N).
- **Restauration en prod** : uniquement après validation sur le projet de test, et après
  confirmation explicite (opération destructive — voir « Mode de travail » de `CLAUDE.md`).

## 4. Rotation des secrets
Tous les secrets vivent dans les variables d'environnement Vercel (jamais au dépôt).
Rotation recommandée : périodique + immédiate en cas de fuite (cf.
`SPROPULSE/Note_securite_secrets_exposes`).

| Secret | Où le régénérer | Où le mettre à jour |
|---|---|---|
| `CALCOM_API_KEY` (Cal.eu) | Cal.com → Settings → Developer → API keys | Vercel env → redeploy |
| `AIRTABLE_TOKEN` | Airtable → Developer hub → Personal access tokens | Vercel env → redeploy |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project → API → *rotate* | Vercel env → redeploy |
| `CRON_SECRET` | générer une valeur aléatoire (≥ 32 o) | Vercel env → redeploy |

Procédure générique : générer la nouvelle clé → mettre à jour la variable Vercel (tous
environnements concernés) → **redéployer** → vérifier (login, un cron manuel) → révoquer
l'ancienne clé. Après rotation d'`AIRTABLE_TOKEN`/`CALCOM_API_KEY`, déclencher un cron
manuel pour confirmer (`curl -H "x-cron-secret: <CRON_SECRET>" .../api/admin/sync-airtable`).

## 5. Crons (tous protégés par `CRON_SECRET`)
| Cron | Horaire (UTC) | Rôle |
|---|---|---|
| `/api/admin/sync-airtable` | `0 5 * * *` | Sync Airtable → Postgres (lecture seule) |
| `/api/admin/mirror-availabilities` | `30 6 * * *` | Miroir des créneaux Cal.eu |
| `/api/admin/export-bpf` | `0 7 * * 1` (lundi) | Export réglementaire (Module 5) |
| `/api/admin/purge-retention` | `15 3 * * *` | Purge de rétention (RGPD/observabilité) |

Déclenchement manuel : `curl -H "x-cron-secret: <CRON_SECRET>" https://<host>/api/admin/<route>`.

## 6. Réponse à incident
1. **Constater** : écran `coordination/exploitation` + logs Vercel + statut Supabase.
2. **Qualifier** la sévérité :
   - *P1* — indisponibilité / fuite de données / RLS contournée.
   - *P2* — cron en échec, dégradation d'une fonction (réservation, sync).
   - *P3* — erreurs isolées, lenteurs.
3. **Contenir** : si abus → vérifier le rate limiting ; si fuite de secret → rotation
   (§4) immédiate ; si régression → rollback du déploiement Vercel (Deployments →
   *Promote* le précédent).
4. **Corriger** : branche → PR → CI verte → merge → déploiement (jamais de hotfix direct
   sur `main` : le ruleset `main-ci-required` l'interdit).
5. **Consigner** : noter l'incident, la cause et l'action dans le suivi projet.

## 7bis. Notifications & relances (INC-7)
- **Activation** : l'envoi réel nécessite `RESEND_API_KEY` + `NOTIF_FROM` (Vercel env). Sans
  eux, les relances sont calculées et journalisées en statut `pending` mais **rien n'est
  envoyé** (dégradation propre). Écran de suivi : `coordination/notifications`.
- **Anti-doublon Airtable (IMPORTANT avant activation)** : tant qu'une automatisation Airtable
  de relance reste active, **désactiver** la même relance côté app via `NOTIF_DISABLED_KINDS`
  (liste séparée par virgules) — sinon double envoi. Kinds : `defense_reminder`,
  `server_access_ending`, `report_pending`. Procédure recommandée au premier déploiement :
  1. poser `NOTIF_DISABLED_KINDS` = tous les kinds encore gérés par Airtable ;
  2. migrer une relance à la fois : désactiver l'automatisation Airtable correspondante, puis
     retirer le kind de `NOTIF_DISABLED_KINDS` ;
  3. vérifier le journal `coordination/notifications` après chaque bascule.
- **Fréquence** : cron `run-notifications` quotidien (08:00 UTC). Idempotent (clé
  `org_id,dedupe_key`) : une ré-exécution ne renvoie jamais un doublon.

## 7. Déploiement (rappel)
Appliquer chaque **migration avant le code** (`supabase db push`). La CI exécute la vraie
suite d'intégration contre un Supabase local jetable ; le merge sur `main` est bloqué tant
que la CI n'est pas verte.
