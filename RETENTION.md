# Politique de rétention et RGPD — SproCLUB

Base **UE** (Supabase, `eu-north-1`), hébergement conforme RGPD. Ce document fixe la
rétention des données personnelles des apprenants et les mécanismes légaux implémentés
(INC-11).

## Données concernées
- **Identité apprenant** (`learners_ro`) : prénom, nom, e-mail, téléphone, ville — modèle
  en lecture, synchronisé depuis Airtable (système de gestion).
- **Dossiers de formation** (`enrollments_ro`) : programme, dates, résultats, insertion.
- **Réservations, livrables, comptes rendus, documents émis, journal d'accès.**
- **Profil vivier** (`talent_profiles`, INC-17) : consentement de visibilité aux entreprises
  partenaires (horodaté, révocable), disponibilité déclarée (date, contrat recherché, mobilité),
  statut posé par la coordination. **Base légale : consentement explicite** de l'apprenant
  (art. 6.1.a RGPD) — sans consentement actif, RIEN n'est exposé aux partenaires ; la vue
  `talent_pool` n'expose qu'une synthèse chiffrée (jamais e-mail, téléphone ni commentaires).
  Le droit à l'oubli supprime le profil vivier immédiatement.

## Durées de rétention
| Donnée | Durée | Base légale |
|---|---|---|
| Dossier de formation (preuves Qualiopi / BPF) | **3 ans** après la fin de l'action | obligations Qualiopi / financeurs |
| Documents émis (attestations, convention, certificat) | 3 ans | idem |
| Journal d'audit des accès (`audit_log`) | **12 mois** glissants | traçabilité RGPD |
| Journal d'exploitation (`ops_events`) | **90 jours** | observabilité |
| Journal de relances (`notifications`) | **90 jours** | minimisation (nom/e-mail en clair) |
| Compteur de débit (`rate_limit_events`) | **2 jours** | technique (anti-abus) |
| Journal des accès rapprochés (`access_sync_log`) | **12 mois** glissants | justifier une ouverture ou une coupure d'accès |
| Comptes utilisateurs inactifs (memberships désactivés) | purge après **24 mois** | minimisation |
| Affectations de ressources (`resource_assignments`, INC-30) | fin de l'accès **+ 30 jours**, puis retirées du reflet à la synchronisation suivante | exécution de la formation ; l'historique reste dans le back office |
| Demandes de mot de passe de ressource (`audit_log`, action `resource.password_request`) | **12 mois** glissants, comme le reste du journal | traçabilité ; le détail porte l'identifiant de connexion, jamais le mot de passe |

Les durées sont indicatives et à valider avec le DPO.

**Accès pilotés par l'annuaire (INC-29)** : depuis qu'Airtable est la seule surface de saisie des
identités, l'ouverture et la coupure des accès se décident à partir des tables « Contacts » et
« Habilitations ». `access_sync_log` conserve **ce que la plateforme a décidé, et pourquoi** (nom de
rôle, adresse e-mail, motif, horodatage), parce que la formule Airtable qui fonde la décision
s'appuie sur la date du jour et ne se rejoue pas. Base légale : intérêt légitime (gestion des accès)
et obligation de traçabilité en contexte certifiant. Lecture réservée à la direction et à la
coordination (RLS), **aucune écriture possible depuis l'application** : seul le compte de service
insère, pour qu'une trace ne puisse pas être réécrite par son sujet. Le journal d'exploitation
(`ops_events`), lui, ne reçoit que des **compteurs**, jamais une adresse e-mail.

**Données techniques (sécurité)** : `ops_events.detail` et `rate_limit_events.key` peuvent
contenir une **adresse IP** client (logs de connexion / anti-abus). Base légale : intérêt
légitime (sécurité, prévention de la fraude). Conservation courte : `ops_events` 90 jours,
`rate_limit_events` 2 jours ; l'e-mail destinataire n'est **pas** journalisé dans `ops_events`.

**Purge automatique (INC-12)** : le cron `/api/admin/purge-retention` (quotidien, 03:15 UTC,
protégé par `CRON_SECRET`) supprime les données opérationnelles expirées — `audit_log` > 12 mois,
`ops_events` > 90 jours, `notifications` > 90 jours, `rate_limit_events` > 2 jours,
`access_sync_log` > 12 mois — et journalise un
résumé dans le journal d'exploitation. Le droit à l'oubli (`eraseLearner`) purge en plus immédiatement
le journal de relances et les préférences de la personne effacée. Les dossiers de formation et documents (preuves Qualiopi/BPF, 3 ans) ne sont
**pas** concernés par cette purge. Voir `RUNBOOK.md`.

## Droits des personnes (implémentés — INC-11)
- **Accès / portabilité** : export des données personnelles d'un apprenant au format JSON
  depuis sa fiche (`/coordination/apprenants/[id]/rgpd/export`), réservé direction/
  coordinateur, **tracé** dans le journal d'audit.
- **Droit à l'oubli / effacement** : bouton « Effacer le dossier » (réservé **direction**,
  confirmation explicite). L'effacement :
  1. **anonymise en place** l'identité (`learners_ro` : prénom → « Anonymisé », nom/
     téléphone/ville → vides, e-mail → jeton `erased-…@erased.invalid`) — l'`id` et les
     clés étrangères sont conservés, donc **aucune rupture d'intégrité référentielle** ;
  2. neutralise les identifiants d'insertion sur les dossiers liés ;
  3. supprime les **documents** stockés de la personne (bucket `learner-docs`) ;
  4. supprime le **compte** (auth + profil) s'il existe ;
  5. inscrit l'e-mail source dans la **liste de suppression** (`data_erasures`) : la
     synchronisation Airtable → Postgres **consulte cette liste et ne réimporte jamais** les
     données de la personne effacée (l'anonymisation n'est pas défaite au prochain sync).
  L'effacement est **tracé** dans le journal d'audit.

## Traçabilité (audit)
Chaque **consultation**, **export** et **effacement** d'un dossier apprenant est enregistré
dans `audit_log` (auteur, action, sujet, horodatage) via la fonction `security definer`
`log_access` — un utilisateur ne peut journaliser que pour son propre organisme et sa
propre identité. Direction/coordinateur consultent le journal depuis la fiche apprenant.

## Cloisonnement
Toutes les tables portent `org_id` + RLS ; le stockage des documents est isolé par
organisme et par apprenant (chemin `{org_id}/{email}/…`, INC-8). Aucune donnée n'est
accessible hors périmètre autorisé (isolation prouvée par les tests d'intégration).

## Mots de passe des ressources (INC-30)
Les mots de passe des accès techniques (serveurs SAP, plateformes) ne sont **pas stockés** par la
plateforme : ils sont lus dans Airtable au moment où l'apprenant les demande, et ne figurent ni
dans Postgres, ni dans l'export RGPD, ni dans les journaux. L'effacement d'un apprenant retire ses
affectations mais **ne change pas le mot de passe du compte** : c'est un compte du stock, réaffecté
ensuite à d'autres apprenants (voir `RUNBOOK.md` §7sexies).

