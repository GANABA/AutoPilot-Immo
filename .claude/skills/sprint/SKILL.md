---
name: sprint
description: Start a new sprint from the ROADMAP.md. Reads the current sprint tasks, creates a task list, and coordinates implementation across backend, frontend, and ML agents.
---

# Skill — Démarrer un sprint

Ce skill lit le `ROADMAP.md`, identifie les tâches du sprint courant, et orchestre l'implémentation.

## Étape 1 — Lire le sprint courant

Lire `ROADMAP.md` et identifier :
- Le sprint en cours (chercher le premier sprint sans toutes les cases cochées `[x]`)
- La liste des tâches `[ ]` à implémenter
- Les dépendances entre tâches

## Étape 2 — Analyser l'état actuel

Avant de coder, lire les fichiers concernés pour comprendre l'état réel :
- Backend : routes, modèles, agents impliqués
- Frontend : pages existantes, client.js
- Identifier ce qui existe déjà vs ce qui est à créer

## Étape 3 — Décomposer en tâches ordonnées

Grouper les tâches par couche et ordonner par dépendance :
1. Modèles BDD + migration (si besoin)
2. Backend endpoints + logique
3. Frontend pages + composants
4. Intégration et tests

## Étape 4 — Implémenter dans l'ordre

Pour chaque tâche :
1. Implémenter le code
2. Vérifier qu'il s'intègre avec l'existant
3. Marquer `[x]` dans ROADMAP.md
4. Passer à la suivante

## Étape 5 — Finaliser

Une fois toutes les tâches du sprint terminées :
```bash
git add -A
git commit -m "feat: sprint X — <résumé>"
git push origin main
```

Mettre à jour ROADMAP.md : marquer le sprint comme complété, identifier le sprint suivant.
