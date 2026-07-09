---
description: Lance les garde-fous qualité (types, build, tests) et rapporte l'état
---

Exécute les garde-fous qualité du projet et rapporte le résultat de façon concise :

1. `npm run typecheck`
2. `npm run build`
3. `npm test`

Si tout passe, réponds « Vert : types, build et tests OK ». Si quelque chose échoue,
liste précisément les échecs (fichier, ligne, message) et arrête-toi là sans continuer
d'autres tâches. Ne désactive jamais un test pour verdir.
