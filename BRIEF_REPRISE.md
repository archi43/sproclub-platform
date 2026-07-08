# Brief de reprise — à coller comme première consigne dans Claude Code

Tu reprends le développement de la plateforme pédagogique multi-locataire SproCLUB.
Commence par lire `CLAUDE.md` (contexte, décisions, conventions) et, si besoin, les
documents de référence du dossier parent SPROPULSE.

## Objectif de cette première session
Rendre le squelette exécutable et poser l'authentification, sans casser l'existant.

## Étapes, dans l'ordre
1. **Valider la base technique.** `npm install`, puis `npm run typecheck` et `npm run build`.
   Corrige les éventuelles erreurs de types ou d'imports jusqu'à obtenir une compilation propre.
   (Le squelette n'a pas pu être compilé dans l'environnement précédent, faute de pouvoir
   installer Next entièrement ; c'est la première chose à confirmer ici.)
2. **Initialiser Git** si ce n'est pas fait : dépôt privé, premier commit du squelette,
   `.env*` bien ignoré. Commits atomiques et messages clairs ensuite.
3. **Base de données.** Applique les migrations dans l'ordre sur la base Supabase
   (`0001_pilot_schema.sql` puis `0002_tenancy.sql`), puis crée l'organisme SproCLUB
   et son connecteur Airtable (bloc Bootstrap commenté en fin de `0002_tenancy.sql`).
4. **Authentification.** Ajoute la connexion Supabase par lien e-mail, la page de login,
   la déconnexion, et des gardes de route par rôle cohérentes avec la matrice de droits
   (direction, coordinateur, coach, évaluateur, apprenant).
5. **Contexte d'organisme en base.** Mets en place le réglage de `app.current_org_id`
   par requête (claim JWT ou RPC `set_config`) dans la couche d'accès aux données,
   afin d'activer la policy `current_org_id()` en plus de `is_member`.
6. **Vérifier l'isolation.** Écris un test qui prouve qu'un utilisateur d'un organisme
   n'accède jamais aux données d'un autre.

## Contraintes non négociables
- Aucun secret dans le dépôt. Clés dans `.env.local` en local, gestionnaire de secrets en prod.
- Sécurité au niveau de la ligne comme garde-fou serveur, jamais un simple filtre d'affichage.
- TypeScript strict, code en anglais, séparation présentation / métier / accès données.
- Hébergement et données en région UE (RGPD).
- Demande confirmation avant toute action destructive (suppression, réinitialisation de base).
- Ne modifie pas la base Airtable existante : elle reste le back office de SproCLUB.

## Definition of done de la session
Le projet compile et démarre en local, l'authentification fonctionne avec des rôles,
les migrations sont appliquées, l'organisme SproCLUB existe, et l'isolation entre
organismes est prouvée par un test. Prépare ensuite la réservation (Cal.com) pour la session suivante.
