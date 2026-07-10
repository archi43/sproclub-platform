# Politique de rétention et RGPD — SproCLUB

Base **UE** (Supabase, `eu-north-1`), hébergement conforme RGPD. Ce document fixe la
rétention des données personnelles des apprenants et les mécanismes légaux implémentés
(INC-11).

## Données concernées
- **Identité apprenant** (`learners_ro`) : prénom, nom, e-mail, téléphone, ville — modèle
  en lecture, synchronisé depuis Airtable (système de gestion).
- **Dossiers de formation** (`enrollments_ro`) : programme, dates, résultats, insertion.
- **Réservations, livrables, comptes rendus, documents émis, journal d'accès.**

## Durées de rétention
| Donnée | Durée | Base légale |
|---|---|---|
| Dossier de formation (preuves Qualiopi / BPF) | **3 ans** après la fin de l'action | obligations Qualiopi / financeurs |
| Documents émis (attestations, convention, certificat) | 3 ans | idem |
| Journal d'audit des accès (`audit_log`) | **12 mois** glissants | traçabilité RGPD |
| Comptes utilisateurs inactifs (memberships désactivés) | purge après **24 mois** | minimisation |

Les durées sont indicatives et à valider avec le DPO ; la purge automatique (cron) relève
d'INC-12 (exploitation).

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
