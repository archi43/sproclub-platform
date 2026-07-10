# ✅ Checklist — Drill de restauration de sauvegarde (SproCLUB)

Prouve qu'une sauvegarde de la base peut être restaurée et que l'application reste
intègre (RLS multi-locataire + invariants de réservation). Complète `RUNBOOK.md` §3
(procédure) et la DoD d'INC-12 (« une restauration de sauvegarde est prouvée »).

- **Durée** : ~15–20 min · **Fréquence conseillée** : périodique + après tout changement d'infra.
- **Règle d'or** : 🚫 **jamais de restauration sur le projet de staging/prod** (`zbvohktqfgwajjvnpets`).
  Toujours un projet/branche **jetable**.

## Phase 0 — Préparation
- [ ] Ouvrir **Supabase → projet staging → Database → Backups**.
- [ ] Noter le **type de sauvegarde actif** : ☐ Sauvegardes quotidiennes  ☐ PITR (Point-In-Time Recovery, payant).
- [ ] Noter la **date/heure du point** à restaurer : ________________
- [ ] **Sauvegarder le `.env.local` actuel** (il pointe sur staging) : `cp .env.local .env.local.bak`

## Phase 1 — Créer la cible jetable
- [ ] Supabase → **New project** (même orga, région **`eu-north-1`**, nom ex. `sproclub-restore-test`).
- [ ] Attendre que le projet soit prêt ; récupérer **URL** + **anon key** + **service_role key** (*Settings → API*).

## Phase 2 — Restaurer la sauvegarde dans la cible
Selon ce qui est disponible :
- [ ] **Option A — PITR / restore natif** : Supabase → Backups → *Restore* vers le **projet de test**
      (jamais en place sur staging).
- [ ] **Option B — dump logique** (si pas de restore vers nouveau projet) :
      - `supabase db dump --db-url "<URL_STAGING>" -f restore-test.sql`
      - `psql "<URL_PROJET_TEST>" -f restore-test.sql`
- [ ] Rattraper les migrations éventuellement manquantes sur la cible :
      `supabase link --project-ref <REF_PROJET_TEST>` puis `supabase db push`

## Phase 3 — Prouver l'intégrité
- [ ] Créer un `.env.local` **pointant sur le projet de test** (URL + anon + service_role du projet de test).
- [ ] Lancer la suite complète : `npm test`
- [ ] **Critère de réussite : `86/86` verts** (RLS + invariants intacts sur les données restaurées).
- [ ] (Optionnel) Vérifier à l'œil quelques tables clés dans le SQL editor (`learners_ro`, `enrollments_ro`, `memberships`).

## Phase 4 — Nettoyage & traçabilité
- [ ] **Restaurer l'env local** : `mv .env.local.bak .env.local` (repointe sur staging).
- [ ] Supprimer le dump s'il existe : `rm -f restore-test.sql`
- [ ] **Supprimer le projet de test** dans Supabase (évite coûts/confusion).
- [ ] ⚠️ Ne **jamais committer** les clés du projet de test.
- [ ] Consigner le résultat ci-dessous, puis reporter dans `RUNBOOK.md` §3 (« Dernière vérification de restauration »).

## 📝 Résultat à consigner
```
Date du drill          : __________
Point restauré         : __________ (date/heure de la sauvegarde)
Type (quotidienne/PITR): __________
npm test               : ☐ 86/86 vert   ☐ échec (détails : __________)
Opérateur              : __________
```

## ⚠️ Pièges à connaître
1. **PITR est payant** — en plan gratuit, seules les sauvegardes quotidiennes existent ; le drill reste
   valable avec l'**Option B** (dump/restore logique), qui prouve la même capacité.
2. **Le service_role key du projet de test** ne doit vivre que dans `.env.local` (gitignoré) et disparaître
   avec le projet.
3. **Historique des drills** : reporter chaque exécution dans `RUNBOOK.md` §3 pour garder la trace.
