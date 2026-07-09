---
description: Implémente un incrément de bout en bout depuis PLAN_DEV_PRODUIT.md
argument-hint: "[numéro d'incrément, ex. INC-3]"
---

Implémente l'incrément $ARGUMENTS de `PLAN_DEV_PRODUIT.md`, de bout en bout et en
autonomie, en respectant le « Mode de travail » et le « Front-end et design system » de
`CLAUDE.md`.

- Traite l'incrément entier : schéma + RLS (`org_id` + policies) + accès données + UI
  (charte, primitives, responsive, accessible) + tests.
- Consulte le cahier des charges écran par écran et le dictionnaire de données du dossier
  SPROPULSE pour le détail métier plutôt que de deviner.
- Garde l'isolation et les invariants de réservation verts (non-régression).
- Respecte la Definition of Done de l'incrément.

Quand c'est prêt, lance `/ship`.
