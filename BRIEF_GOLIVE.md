# Brief go-live base — à coller comme consigne dans Claude Code

Le projet Supabase existe. Objectif de cette session : appliquer le schéma sur la
vraie base et **prouver en réel** l'isolation inter-organismes et les invariants de
réservation. On ne rajoute pas de fonctionnalité tant que ces deux suites ne sont pas vertes.

## Pré-vérification
- Confirme d'abord que le projet Supabase est en **région européenne** (RGPD). S'il ne
  l'est pas et que la base est encore vide, signale-le moi avant d'aller plus loin :
  mieux vaut le recréer en UE maintenant.

## Étapes, dans l'ordre
1. **Configurer les clés.** Aide-moi à remplir `.env.local` à partir de `.env.example` :
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   et `DEV_DEFAULT_ORG_SLUG=sproclub`. Ne me demande jamais de coller ces valeurs dans le
   chat ni dans un fichier versionné ; elles restent dans `.env.local` (déjà ignoré par Git).
2. **Appliquer les migrations** dans l'ordre sur la base : `0001` → `0002` → `0003` → `0004`
   (éditeur SQL Supabase ou CLI `supabase`). Vérifie qu'aucune n'échoue.
3. **Jouer le seed** `supabase/seed/sproclub_bootstrap.sql` (organisme SproCLUB + config
   du connecteur Airtable). Récupère l'`id` de l'organisme SproCLUB.
4. **Provisionner un utilisateur de test** (via l'API admin, service role) :
   crée un compte, positionne le claim `app_metadata.org_id` = id SproCLUB, insère une
   ligne `memberships` (org_id, profile_id, role). Fais-en au moins un `student` et un
   `coordinator` pour couvrir les deux chemins.
5. **Lancer les tests contre la vraie base** : `npm run test:isolation` puis
   `npm run test:booking`. Les deux doivent passer au vert. Si un test échoue, diagnostique
   et corrige avant tout le reste ; ne masque jamais un échec en désactivant une assertion.
6. **Vérification manuelle rapide** : `npm run dev`, connexion par lien e-mail,
   ouverture de `/mon-parcours`, et confirme que l'apprenant ne voit que ses données.

## Contraintes
- Aucun secret dans le dépôt ni dans le chat ; tout dans `.env.local` et le gestionnaire
  de secrets en prod.
- Ne touche pas à la base Airtable existante.
- Demande confirmation avant toute opération destructive sur la base.
- Cohérence des e-mails : les comptes d'authentification et les e-mails des données
  synchronisées doivent être normalisés en minuscules, sinon le rattachement RLS échoue.

## Definition of done
Migrations et seed appliqués, un utilisateur de test provisionné avec claim et membership,
`test:isolation` et `test:booking` **verts contre la vraie base**, et parcours apprenant
vérifié à l'écran. Ensuite seulement : brancher les clés Cal.com et le miroir des créneaux.
