---
name: migration
description: Create and apply an Alembic database migration for AutoPilot Immo. Use when adding/modifying SQLAlchemy models. Guides through model change → migration generation → review → apply → commit.
---

# Skill — Migration Alembic

Suis ces étapes dans l'ordre pour créer et appliquer une migration.

## Étape 1 — Modifier le modèle SQLAlchemy

Fichier : `backend/app/database/models.py`

Ajouter la colonne ou la table. Exemples :
```python
# Nouvelle colonne nullable (migration sûre en prod)
new_field = Column(String, nullable=True)

# Nouvelle colonne avec défaut (migration sûre)
status = Column(String, default="draft", server_default="draft")

# Colonne NOT NULL sans défaut → DANGEREUX en prod si la table a des lignes
# Toujours ajouter nullable=True d'abord, puis une migration séparée pour remplir + contraindre
```

## Étape 2 — Générer la migration

```bash
cd backend
alembic revision --autogenerate -m "description courte de la migration"
```

Nommage : utiliser des descriptions claires comme :
- `add_visitor_id_to_conversations`
- `add_website_crawl_fields_to_tenant`
- `create_followup_drafts_table`

## Étape 3 — Vérifier le fichier généré

```bash
ls alembic/versions/ | tail -5
```

Ouvrir le fichier généré et vérifier :
- `upgrade()` fait bien ce qu'on attend
- `downgrade()` est l'inverse exact
- Pas de colonnes inattendues ajoutées ou supprimées
- Les types sont corrects (String vs Text, Float vs Numeric)

⚠️ Alembic ne détecte pas toujours : renommages de colonnes, changements de contraintes, colonnes Vector pgvector.  
Pour les colonnes Vector, écrire la migration à la main :
```python
from sqlalchemy import text
def upgrade():
    op.execute(text("ALTER TABLE properties ADD COLUMN new_embedding vector(1536)"))
def downgrade():
    op.drop_column('properties', 'new_embedding')
```

## Étape 4 — Appliquer en local

```bash
alembic upgrade head
```

Si erreur, corriger le fichier de migration et relancer. Ne jamais modifier une migration déjà appliquée en prod.

## Étape 5 — Tester

Vérifier que :
- Le schéma BDD correspond au modèle SQLAlchemy
- Les endpoints concernés fonctionnent toujours
- `alembic current` affiche la nouvelle révision

## Étape 6 — Committer

```bash
git add alembic/versions/<nouveau_fichier>.py backend/app/database/models.py
git commit -m "db: <description de la migration>"
```

⚠️ **Toujours committer le fichier de migration avec les changements de modèle.**  
Render applique `alembic upgrade head` au démarrage (à configurer si ce n'est pas le cas).

## Rollback d'urgence

```bash
# Revenir à la révision précédente
alembic downgrade -1

# Revenir à une révision spécifique
alembic downgrade <revision_id>
```
