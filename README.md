# SproCLUB Platform

Plateforme pédagogique **multi-locataire** (SaaS), tenant-aware par conception.
Étape 1 de la trajectoire : fondations techniques. Next.js (App Router) + Supabase.

Le socle de vérité du produit est **Postgres**. Airtable n'est qu'un connecteur
propre à l'organisme SproCLUB (voir le script `sync_cible` à la racine du projet).

## Structure

```
sproclub-platform/
  src/
    app/
      layout.tsx  page.tsx            # racine plateforme
      (portal)/mon-parcours/page.tsx  # portail apprenant (pilote, ecran P.A1)
      api/health/route.ts             # sonde de sante + org resolue
    lib/
      env.ts                          # env validees (fail-fast)
      types.ts                        # types partages
      tenant.ts                       # resolution de l'organisme (multi-tenant)
      supabase/server.ts client.ts    # clients Supabase (serveur / navigateur)
    middleware.ts                     # resolution tenant + refresh session
  supabase/migrations/
    0001_pilot_schema.sql             # schema pilote
    0002_tenancy.sql                  # couche de cloisonnement (organisations, RLS)
  .github/workflows/ci.yml            # typecheck + lint
```

## Prérequis

- Node 20+
- Un projet Supabase (région UE)

## Installation

```bash
cd sproclub-platform
npm install
cp .env.example .env.local   # renseigner URL + cles Supabase
```

## Base de données

Appliquer les migrations dans l'ordre sur la base Supabase :

```bash
# via l'editeur SQL Supabase, ou la CLI supabase
supabase/migrations/0001_pilot_schema.sql
supabase/migrations/0002_tenancy.sql
```

Puis créer le premier organisme (SproCLUB) et son connecteur Airtable :
voir le bloc `Bootstrap` commenté en fin de `0002_tenancy.sql`.

## Lancer

```bash
npm run dev         # http://localhost:3000
npm run typecheck   # verification des types
npm run build       # build de production
```

## Modèle multi-locataire

- **Résolution du tenant** : `middleware.ts` déduit l'organisme du domaine
  (sous-domaine `org.sproclub.app` ou domaine personnalisé) et le transmet aux
  Server Components via des en-têtes de requête. `lib/tenant.ts` résout la ligne
  `organizations` correspondante.
- **Isolation** : chaque table métier porte `org_id`. La sécurité au niveau de la
  ligne (RLS `is_member(org_id)`) empêche tout accès inter-organismes, côté serveur.
- **Organisme actif** : les requêtes filtrent aussi sur l'organisme courant
  (`.eq('org_id', org.id)`) pour les utilisateurs appartenant à plusieurs organismes.

### À implémenter ensuite (documenté)

- **Contexte d'organisme en base** : positionner `app.current_org_id` par requête
  (claim JWT ou RPC `set_config`) pour activer la policy `current_org_id()` en plus
  de `is_member`. La couche d'accès aux données centralisera ce réglage.
- **Authentification** : pages de connexion (lien e-mail Supabase) et gardes de route.
- **Réservation** : intégration Cal.com (evenements collectifs, jury de deux).
- **Synchronisation** : brancher `sync_cible` vers Postgres pour l'organisme SproCLUB.

## Sécurité

Aucun secret dans le dépôt. Les clés vivent dans `.env.local` (non committé) et,
en production, dans le gestionnaire de secrets de l'hébergeur. La clé de service
Supabase n'est utilisée que par du code serveur (résolution du tenant).
