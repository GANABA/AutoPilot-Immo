---
name: deploy
description: Pre-deploy checklist and deployment procedure for AutoPilot Immo on Render. Run before any production push to verify everything is ready.
---

# Skill — Déploiement Render

## Checklist pré-déploiement

### Code
- [ ] Tous les tests passent (si des tests existent)
- [ ] Pas de `print()` de debug laissés
- [ ] Pas de credentials hardcodés dans le code
- [ ] Les variables d'environnement nouvelles sont documentées dans `ROADMAP.md`
- [ ] Les migrations Alembic sont committées avec les changements de modèles

### Base de données
- [ ] Si nouvelle migration : vérifier que `alembic upgrade head` tourne sans erreur en local
- [ ] Vérifier que `downgrade()` est implémenté dans chaque migration

### Variables d'environnement Render
Vérifier que toutes les variables requises sont configurées dans le dashboard Render :
```
DATABASE_URL          ✓ (Render PostgreSQL — auto-configuré)
REDIS_URL             ✓ (Render Redis — auto-configuré)
SECRET_KEY            ✓
ADMIN_EMAIL           ✓
ADMIN_PASSWORD        ✓
OPENAI_API_KEY        ✓
OPENAI_MODEL          ✓ (gpt-4o)
OPENAI_MODEL_MINI     ✓ (gpt-4o-mini)
OPENAI_EMBEDDING_DIMENSIONS ✓ (1536)
SENDGRID_API_KEY      ✓
SENDGRID_FROM_EMAIL   ✓
GOOGLE_CALENDAR_CREDENTIALS_JSON ✓
GOOGLE_CALENDAR_ID    ✓
PUBLIC_URL            ✓ (https://ton-app.onrender.com)
ALLOWED_ORIGINS       ✓
```

### Frontend (si modifié)
- [ ] `cd frontend/dashboard && npm run build` passe sans erreur
- [ ] Le dossier `dist/` est à jour (si committé manuellement)

## Procédure de déploiement

```bash
# 1. Vérifier l'état du repo
git status
git log --oneline -5

# 2. Push sur main
git push origin main

# 3. Render déploie automatiquement depuis main
# Surveiller les logs dans le dashboard Render
```

## Vérification post-déploiement

```bash
# Health check
curl https://ton-app.onrender.com/health

# Réponse attendue
# {"status": "ok", "service": "AutoPilot Immo"}
```

Vérifier dans les logs Render :
- `AutoPilot Immo started.`
- Pas d'erreur de migration Alembic
- Pas d'ImportError au démarrage

## Rollback d'urgence

Render conserve les déploiements précédents. Dans le dashboard Render :
1. Aller dans "Deploys"
2. Sélectionner le déploiement précédent
3. Cliquer "Rollback to this deploy"

## Commandes Render utiles (via CLI render)

```bash
# Voir les logs en temps réel
# → Dashboard Render > Service > Logs

# Redémarrer le service sans redéployer
# → Dashboard Render > Service > Manual Deploy > Clear build cache & deploy
```

## Surveillance en production

Les health checks Render arrivent toutes les ~20 secondes sur `GET /health`.  
Si le service ne répond plus → Render redémarre automatiquement.

Erreurs à surveiller dans les logs :
- `psycopg2.OperationalError` → problème connexion DB
- `SupportAgent error` → agent planté (le WebSocket continue mais renvoie un message d'erreur)
- `Calendar create_visit_event error` → Google Calendar mal configuré
- `Celery` errors → workers non démarrés ou Redis down
