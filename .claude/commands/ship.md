---
description: Clôture propre d'un incrément (vérif, revue, docs, commit, déploiement)
---

Clôture l'incrément en cours proprement, dans cet ordre :

1. Lance `/verify` : types, build et tests doivent être verts. Si non, corrige d'abord.
2. Lance `/review` et traite tout constat critique ou élevé.
3. Mets à jour la section « État actuel » de `CLAUDE.md` et le statut de l'incrément dans
   `PLAN_DEV_PRODUIT.md`.
4. Commit atomique, message conventionnel (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
5. Pousse ; vérifie que la CI est verte et que le staging reflète la version.

Contraintes : aucun secret ni donnée personnelle réelle committé ; ne touche pas la base
Airtable ; demande confirmation avant toute opération destructive sur la base de production.
