# Mise en route — SproCLUB Platform

Guide d'installation pour rendre la plateforme opérationnelle en local puis brancher
la base Supabase. Toutes les données et l'hébergement doivent rester en **région UE** (RGPD).

## 1. Prérequis

- Node.js 20+ (testé sur v25) et npm.
- Un compte Supabase.

## 2. Installer et valider en local

```bash
cd sproclub-platform
npm install
npm run typecheck   # doit passer
npm run build       # doit passer
```

Un fichier `.env.local` de développement existe déjà avec des valeurs **de remplacement**
(`placeholder...`). Elles suffisent à compiler, mais pas à parler à une vraie base.

## 3. Créer le projet Supabase (région UE)

1. Sur Supabase, **New project** → choisir une région **EU** (ex. `eu-west-3` / `eu-central-1`).
2. Récupérer, dans _Project Settings → API_ :
   - `Project URL`
   - `anon public` key
   - `service_role` key (secret — usage serveur uniquement)
3. Renseigner `.env.local` avec ces valeurs réelles :

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
APP_BASE_DOMAIN=localhost:3000
```

> `.env.local` est ignoré par Git. Ne jamais committer de clé réelle. En production,
> utiliser le gestionnaire de secrets de l'hébergeur, pas un fichier.

## 4. Appliquer les migrations (dans l'ordre)

Dans le **SQL Editor** de Supabase, exécuter successivement le contenu de :

1. `supabase/migrations/0001_pilot_schema.sql`
2. `supabase/migrations/0002_tenancy.sql`
3. `supabase/migrations/0003_auth_org_context.sql`

`0003` consolide les rôles sur `memberships`, corrige l'isolation multi-locataire et
installe le contexte d'organisme (`set_current_org` + claim JWT). Il **doit** être appliqué.

## 5. Créer l'organisme SproCLUB

Exécuter `supabase/seed/sproclub_bootstrap.sql` dans le SQL Editor. Il crée l'organisme
`sproclub` et son connecteur Airtable (référence de secret seulement, jamais le jeton).

## 6. Provisionner un premier utilisateur (apprenant de test)

Les comptes sont créés par un administrateur ; le formulaire de login n'en crée pas.
Le claim `app_metadata.org_id` est **essentiel** : c'est lui que lit `current_org_id()`.

Exemple (SQL Editor — remplacer l'e-mail) :

```sql
-- 1) Récupérer l'id de l'organisme
select id from organizations where slug = 'sproclub';  -- => <ORG_ID>
```

Puis créer l'utilisateur via l'API Admin (Dashboard _Authentication → Add user_, ou
un script Node avec la service_role). Renseigner **app_metadata** : `{"org_id":"<ORG_ID>"}`.
Enfin, lier profil + rôle :

```sql
insert into profiles (id, email) values ('<USER_ID>', '<email>');
insert into memberships (org_id, profile_id, role)
  values ('<ORG_ID>', '<USER_ID>', 'student');
```

## 7. Lancer en local avec un sous-domaine d'organisme

Le locataire est résolu depuis l'hôte. `localhost:3000` = racine de plateforme (aucun
organisme). Pour atteindre SproCLUB, utiliser son **slug** en sous-domaine :

```bash
npm run dev
# puis ouvrir :  http://sproclub.localhost:3000
```

La plupart des navigateurs résolvent `*.localhost` vers 127.0.0.1 sans configuration.
La page `/login` envoie un lien magique ; le lien renvoie sur `/auth/callback` du même hôte.

## 8. Prouver l'isolation (test d'intégration)

Une fois les migrations appliquées et `.env.local` renseigné avec les vraies clés :

```bash
npm run test:isolation
```

Le test crée deux organismes jetables, un apprenant dans chacun, puis vérifie qu'un
apprenant de l'organisme A ne peut **jamais** lire les données de l'organisme B (par
`org_id`, par clé primaire, ni via `set_current_org`). Sans clés réelles, le test se
saute automatiquement.

## Réservation (Cal.com) — Étape 2

Les règles métier de réservation sont déjà **verrouillées en base** (migration `0004`,
triggers) et prouvées par `npm run test:booking` :
- une **soutenance** ne peut être réservée qu'une fois le **livrable déposé** ;
- le **coach référent** ne peut jamais faire partie du jury ;
- une soutenance se confirme avec **exactement deux évaluateurs**, tous issus du vivier du
  programme ; jamais plus de deux.

Reste à brancher l'API Cal.com (adaptateur `src/lib/booking/calcom.ts`) :
1. Créer, dans Cal.com, **deux types d'événement** : coaching (individuel) et soutenance
   (jury de deux). Noter leurs `eventTypeId`.
2. Générer une **clé API** Cal.com.
3. Renseigner dans `.env.local` :
   ```dotenv
   CALCOM_API_KEY=<clé>
   CALCOM_EVENT_TYPE_COACHING=<id>
   CALCOM_EVENT_TYPE_DEFENSE=<id>
   ```
4. Un job serveur de confiance miroite les créneaux Cal.com vers la table `availabilities`
   et pousse les réservations confirmées vers Airtable (Planning / Soutenances).

Tant que ces clés sont absentes, `getBookingProvider()` lève `ProviderNotConfiguredError`
(le reste de l'app fonctionne). Les appels HTTP de l'adaptateur restent à valider de bout
en bout contre de vraies clés.

## Sécurité — rappels non négociables

- Aucun secret dans le dépôt (`.env.local` local, gestionnaire de secrets en prod).
- L'isolation repose sur **RLS côté serveur** (`0003`), pas sur un filtre d'affichage.
- Données et hébergement en **UE**.
- Airtable reste le back office de SproCLUB : ne pas le modifier depuis la plateforme.
