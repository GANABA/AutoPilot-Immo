# AutoPilot Immo — Contexte Projet

## Ce qu'est ce projet
Système multi-agents IA pour agences immobilières. Backend FastAPI + React dashboard + widget chatbot JS vanilla. Déployé sur Render.

**Agence fictive** : ImmoPlus Lyon (slug: `immoplus`, tenant_id en BDD)

---

## Stack technique

| Couche | Technologie |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.0, Alembic |
| Base de données | PostgreSQL 16 + pgvector (extension vecteurs) |
| Cache / Queue | Redis + Celery (Beat pour tâches planifiées) |
| Agents IA | LangGraph (graphes d'état), OpenAI API |
| LLM | GPT-4o (`OPENAI_MODEL`) et GPT-4o-mini (`OPENAI_MODEL_MINI`) |
| Embeddings | text-embedding-3-small, 1536 dimensions |
| Voix | Vapi (STT Deepgram + TTS) — migration en cours depuis Twilio custom |
| Frontend | React 18 + Tailwind CSS + Vite |
| Widget | JS Vanilla (chatbot intégrable) |
| Déploiement | Render (web service + PostgreSQL managed + Redis) |

---

## Architecture des dossiers

```
backend/app/
├── agents/          # Agents LangGraph (support, analyst, writer, orchestrator, voice)
├── api/
│   ├── routes/      # Endpoints FastAPI (auth, chat, properties, listings, documents, voice, workflows, stats)
│   └── schemas.py   # Modèles Pydantic request/response
├── database/
│   ├── models.py    # Modèles SQLAlchemy (Tenant, User, Property, Conversation, Message, Document, Listing, AgentTask)
│   ├── connection.py # Engine + SessionLocal + Base
│   └── vector_store.py # Fonctions pgvector (generate_embedding, search_similar_properties)
├── services/
│   ├── email_service.py    # SendGrid (6 fonctions d'envoi)
│   └── calendar_service.py # Google Calendar (get_available_slots, create_visit_event)
├── tasks/
│   ├── celery_app.py       # Config Celery + Beat schedule
│   ├── document_tasks.py   # Analyse PDF async
│   └── followup_tasks.py   # Relances J+7
├── ingestion/       # Import CSV biens + génération embeddings
├── config.py        # Settings Pydantic (variables d'environnement)
└── main.py          # App FastAPI, lifespan, routers, CORS

frontend/
├── dashboard/src/   # React dashboard (pages: Dashboard, Properties, Conversations)
└── widget/          # Chatbot JS vanilla (chatbot.js, chatbot.css, demo.html)
```

---

## Modèles de données clés

### Tenant
```python
id, name, slug, email, phone, website_url, settings (JSON), created_at
```
`settings` contient toute la config agence (greeting, horaires, calendar, email, voice, IA...).  
Voir `ROADMAP.md` pour le schéma complet des settings.

### Property
```python
id, tenant_id, type, title, description, price, surface, nb_rooms, city, zipcode,
has_balcony, has_parking, has_elevator, energy_class, charges_monthly,
photos (JSON list URLs), status, embedding (Vector 1536), created_at
```

### Conversation
```python
id, tenant_id, channel (web_chat|phone|email), prospect_name, prospect_email,
prospect_phone, search_criteria (JSON), status (open|qualified|visit_booked|closed), created_at
```

### Message
```python
id, conversation_id, role (user|assistant|system), content, extra (JSON), created_at
```
Les messages `role="system"` avec `content="FOLLOWUP_SENT:..."` sont des marqueurs internes.

---

## Agents LangGraph — structure commune

Chaque agent hérite de `BaseAgent` (`agents/base.py`) et implémente :
- `agent_name: str` (property)
- `run(input_data: dict, db: Session) -> dict`
- Graphe LangGraph compilé dans `__init__`

### SupportAgent — nodes dans l'ordre
1. `extract_criteria` → critères JSON depuis le message
2. `search_properties` → pgvector + filtres SQL
3. `detect_contact` → regex email/nom
4. `handle_booking` → intent visite + Google Calendar
5. `generate_response` → réponse finale LLM

**État passé à `agent.run()`** :
```python
{
    "message": str,
    "history": list[dict],      # [{role, content}]
    "available_slots": list,     # créneaux persistés en session
    "contact_captured": bool,    # bool(conv.prospect_email)
}
```

---

## Conventions de code

### Backend
- Toujours `from __future__ import annotations` en tête de fichier
- Sessions DB : `db: Session = Depends(get_db)` dans les endpoints REST, `SessionLocal()` dans WebSocket/Celery
- Fermer les sessions manuelles dans `finally: try: db.close() except: pass`
- Imports lourds (agents, services) en lazy import dans les fonctions pour éviter les circular deps
- Les nodes LangGraph retournent un `dict` partiel (seuls les champs modifiés)
- `.replace()` et jamais `.format()` pour injecter du contexte dans les prompts (les descriptions de biens peuvent contenir `{}`)

### Frontend (dashboard)
- Composants fonctionnels React uniquement
- Tailwind CSS, palette `slate-*` pour les fonds sombres, `blue-600` comme couleur primaire
- API calls via `frontend/dashboard/src/api/client.js` (fonction `req()`)
- Pas de state management externe (useState + props suffisent pour l'instant)

### Widget (chatbot.js)
- IIFE `(function() { "use strict"; ... })()`
- Pas de dépendances externes (sauf marked.js chargé dynamiquement)
- Session persistée dans `localStorage` avec clé `ap_immo_session`

---

## Variables d'environnement requises

```
DATABASE_URL, REDIS_URL, SECRET_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
OPENAI_API_KEY, OPENAI_MODEL, OPENAI_MODEL_MINI, OPENAI_EMBEDDING_DIMENSIONS
SENDGRID_API_KEY, SENDGRID_FROM_EMAIL
GOOGLE_CALENDAR_CREDENTIALS_JSON, GOOGLE_CALENDAR_ID
VAPI_API_KEY, VAPI_WEBHOOK_SECRET  (Phase 4 - Vapi)
PUBLIC_URL, ALLOWED_ORIGINS
```

---

## Pièges connus à éviter

1. **Ne jamais utiliser `.format()` sur les prompts LLM** — utiliser `.replace()` (les descriptions de biens contiennent des `{}`)
2. **`db.close()` dans WebSocket** — toujours dans `try/except` (connexion peut être morte après idle Render)
3. **`pool_recycle=300`** est configuré sur l'engine — ne pas le supprimer (timeout Render 5 min)
4. **`contact_captured`** doit être passé à chaque appel `agent.run()` — oublier = l'agent redemande l'email
5. **`session_slots`** (créneaux calendrier) vit en mémoire dans la session WebSocket — ne pas le persister en BDD pour le chat (risque de stale data)
6. **Google Calendar attendees** — toujours vérifier que l'email contient `@` avant de l'ajouter (sinon 400 Invalid attendee)
7. **Migrations Alembic** — toujours via `alembic revision --autogenerate`, jamais modifier `Base.metadata.create_all` directement en prod

---

## Roadmap
Voir `ROADMAP.md` à la racine du projet. Sprint en cours : **S1 — Settings & Configuration agence**.
