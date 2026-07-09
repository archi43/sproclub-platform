---
description: Revue de qualité (sécurité, RLS multi-locataire, RGPD, accessibilité) des changements en cours
---

Lance une revue rigoureuse des changements en cours (diff non commité) en déléguant au
sous-agent `security-reviewer`. Il doit vérifier :

- Cloisonnement multi-locataire : toute nouvelle table porte `org_id` + policies RLS ;
  aucune donnée accessible hors de son organisme ; la RLS est le garde-fou serveur, pas un
  simple filtre d'affichage.
- Sécurité : pas de secret en clair, redirections sûres, validation des entrées, contrôle
  des accès par rôle cohérent avec la matrice de droits.
- RGPD : données personnelles limitées au nécessaire, journalisation des accès aux dossiers.
- Accessibilité et responsive : contrastes, navigation clavier, libellés ARIA, mobile.

Restitue les constats classés par sévérité (critique, élevé, moyen) avec fichier, ligne et
correctif proposé. Priorise les critiques.
