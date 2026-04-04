# PRD — AutoPilot Immo

**Version** : 1.0
**Date** : 2026-03-31
**Statut** : Approuvé — En développement
**Objectif** : Portfolio freelance / preuve de compétences multi-agents IA

---

## 1. Contexte et motivation

### Le problème métier

Un agent immobilier dans une agence de taille moyenne (5-10 agents) gère 30-50 biens en portefeuille et reçoit 20-40 demandes par jour. Sur une journée de 10 heures, il passe **5-6 heures sur des tâches répétitives** :

- Lecture et réponse aux emails de prospects (15 emails × 10 min = 2h30)
- Rédaction d'annonces pour les nouveaux mandats (3 annonces × 30 min = 1h30)
- Réponses aux questions récurrentes ("est-ce disponible ?", "y a-t-il un parking ?")
- Relances prospects post-visite, mise à jour des fiches clients

Il ne lui reste que **4 heures pour les tâches à valeur ajoutée** : visites, négociation, signature.

Appels manqués pendant les visites, prospects non qualifiés qui prennent du temps, annonces rédigées manuellement plateforme par plateforme — tout cela représente du chiffre d'affaires perdu.

### L'objectif du projet

Construire **AutoPilot Immo** : une démonstration complète d'un système multi-agents IA appliqué à l'immobilier, déployée et accessible en ligne, servant de **pièce maîtresse de portfolio** pour crédibiliser une activité freelance en développement IA.

Ce projet démontre :
- Conception et implémentation d'une architecture multi-agents (LangGraph)
- Intégration RAG (Retrieval-Augmented Generation) avec base vectorielle
- Pipeline voix temps-réel (STT → LLM → TTS)
- Orchestration de workflows asynchrones (Celery)
- Déploiement production complet (Docker, CI/CD)
- Qualité de code (tests, documentation, README)

---

## 2. Décisions d'architecture

### Ce que ce projet N'est PAS

Ce projet est un **portfolio technique**, pas un SaaS commercial. Les décisions suivantes ont été prises consciemment pour réduire la complexité sans sacrifier la démonstration technique :

| Fonctionnalité SaaS | Décision Portfolio | Justification |
|---|---|---|
| Multi-tenant complet | Single tenant (agence fictive "ImmoPlus") | Inutile pour la démo, ajoutable après |
| ChromaDB (service séparé) | pgvector (extension PostgreSQL) | Moins de services, même résultat |
| ElevenLabs / Coqui TTS | OpenAI TTS (`tts-1`) | Moins cher, une API de moins |
| n8n (workflows d'intégration) | Supprimé | Complexité opérationnelle sans valeur démo |
| S3 / stockage objet | Stockage local `/data/uploads` | Suffisant pour démo |
| Celery Beat (cron automatique) | Hors scope MVP | Follow-up automatique = Phase future |
| RGPD / conformité légale | Non requis | Données fictives uniquement |
| Onboarding self-service | Manuel (si nécessaire) | Hors scope portfolio |

### Stack technique retenue

```
Backend      : Python 3.11+, FastAPI, SQLAlchemy, Alembic
Base données : PostgreSQL 16 + pgvector (recherche vectorielle)
Cache/Queue  : Redis + Celery (tâches async)
IA           : LangGraph (orchestration), OpenAI API
               - GPT-4o-mini : support, rédacteur, vocal
               - GPT-4o      : analyste, orchestrateur
               - Whisper     : speech-to-text
               - TTS-1       : text-to-speech
Voix         : Twilio (téléphonie) + pipeline Whisper → LLM → OpenAI TTS
Frontend     : React + Tailwind CSS (dashboard)
               JS vanilla (widget chatbot intégrable)
Déploiement  : Docker Compose → Railway ou Render
CI/CD        : GitHub Actions
```

---

## 3. Agents IA

### 3.1 Agent Support — Chatbot RAG 24/7

**Responsabilité** : Premier contact avec les prospects, qualification des besoins, présentation des biens.

**Pipeline** :
```
Message prospect
  → Extraction critères (type, budget, surface, ville, équipements)
  → Recherche sémantique pgvector (biens les plus proches)
  → Filtre SQL structuré (prix min/max, surface min, nb pièces)
  → Réponse naturelle avec biens correspondants
  → Si visite souhaitée → créneaux Google Calendar
  → Stockage conversation + critères PostgreSQL
  → Si confiance < 0.7 → escalade email notification
```

**Modèle** : GPT-4o-mini (volume élevé, tâche guidée)
**Ton** : Professionnel, chaleureux. Vouvoiement. Toujours proposer une action suivante.
**Interface** : WebSocket (temps réel) + REST fallback + Widget JS vanilla

---

### 3.2 Agent Rédacteur — Génération d'annonces

**Responsabilité** : Générer des annonces optimisées par plateforme et des emails de suivi.

**Pipeline** :
```
property_id + plateforme cible
  → Chargement données bien (Property) + données documents (extracted_data)
  → Application template plateforme (longueur max, SEO, format)
  → Génération titre + description
  → Stockage Listing (status="draft")
  → Validation humaine dans le dashboard avant publication
```

**Plateformes** : LeBonCoin, SeLoger, site web agence
**Modèle** : GPT-4o-mini
**Emails générés** : suivi post-visite, relance J+7, nouveau bien correspondant

---

### 3.3 Agent Analyste — Traitement de documents PDF

**Responsabilité** : Extraire et structurer les informations des documents immobiliers.

**Pipeline** :
```
PDF uploadé
  → Classification type document (DPE, copro, mandat, autre)
    via premiers 500 tokens → LLM
  → Extraction JSON structurée selon le type :
      DPE     : classe énergétique, consommation, CO2, recommandations
      Copro   : charges mensuelles, travaux votés, fonds de roulement
      Mandat  : conditions, durée, honoraires
  → Stockage extracted_data dans Document
  → Indexation texte complet dans pgvector (RAG)
  → Traitement asynchrone via Celery (non-bloquant)
```

**Modèle** : GPT-4o (extraction précise, documents complexes)

---

### 3.4 Agent Vocal — Téléphone 24/7

**Responsabilité** : Répondre aux appels entrants quand les agents sont indisponibles.

**Pipeline** :
```
Appel entrant Twilio
  → Webhook → WebSocket bidirectionnel
  → Flux audio → chunks 3s → Whisper API → texte
  → Détection fin de phrase (pause > 1.5s)
  → Texte → SupportAgent (même logique que chatbot)
  → Réponse texte → OpenAI TTS (streaming)
  → Flux audio retour via WebSocket → Twilio → appelant
```

**Modèle STT** : OpenAI Whisper
**Modèle LLM** : GPT-4o-mini (latence prioritaire)
**Modèle TTS** : OpenAI TTS-1
**Objectif latence** : < 3 secondes fin de parole → début de réponse audio
**Technique latence** : streaming TTS dès les premiers tokens LLM

---

### 3.5 Orchestrateur — Workflows LangGraph

**Responsabilité** : Coordonner les agents pour les workflows multi-étapes.

**Workflows** :

```
new_property :
  Bien rentré → Analyste (documents) → Rédacteur (annonces) → Notification prospects matchants

incoming_email :
  Email entrant → Classification → Support (réponse auto) OU escalade agent humain

follow_up [Phase future] :
  J+7 après visite → Rédacteur (email relance) → Envoi SendGrid
```

**Modèle** : GPT-4o (décisions de routage complexes)
**Déclenchement** : API REST, ou automatique via Celery Beat (Phase future)

---

## 4. Modèles de données

```python
Tenant       — agence immobilière (single dans ce projet : ImmoPlus)
Property     — bien immobilier (type, prix, surface, ville, équipements, photos, statut)
Conversation — fil de discussion avec un prospect (canal, critères extraits, statut)
Message      — message individuel dans une conversation (role: user/assistant/system)
Document     — document PDF uploadé (type, URL, extracted_data JSON, statut traitement)
Listing      — annonce générée (plateforme, titre, contenu, statut: draft/approved/published)
Task         — log d'exécution d'un agent (agent, action, input, output, durée, statut)
```

---

## 5. APIs externes

| Service | Usage | Coût estimé dev |
|---|---|---|
| OpenAI API | GPT, Whisper, TTS | ~$5-10 en tests |
| Twilio | Téléphonie (appels entrants) | $15 crédit offert (trial) |
| Google Calendar API | Créneaux de visite | Gratuit |
| SendGrid | Emails notifications/relances | Gratuit (100/jour) |

---

## 6. Structure du projet

```
autopilot-immo/
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI app, CORS, lifespan
│   │   ├── config.py                  # Settings via pydantic-settings (.env)
│   │   ├── database/
│   │   │   ├── connection.py          # Engine + SessionLocal + get_db
│   │   │   ├── models.py              # SQLAlchemy models
│   │   │   └── vector_store.py        # pgvector interface (embeddings + search)
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── properties.py      # CRUD biens immobiliers
│   │   │   │   ├── chat.py            # WebSocket chatbot + REST fallback
│   │   │   │   ├── documents.py       # Upload et analyse de documents
│   │   │   │   ├── listings.py        # Génération d'annonces
│   │   │   │   ├── voice.py           # Endpoints vocaux (WebSocket)
│   │   │   │   ├── workflows.py       # Déclenchement de workflows
│   │   │   │   └── auth.py            # Authentification JWT
│   │   │   ├── schemas.py             # Pydantic models (request/response)
│   │   │   └── dependencies.py        # Dépendances FastAPI (auth, tenant)
│   │   ├── agents/
│   │   │   ├── base.py                # Classe abstraite BaseAgent
│   │   │   ├── support/
│   │   │   │   ├── agent.py           # SupportAgent (RAG sur les biens)
│   │   │   │   ├── tools.py           # search_properties, check_availability, book_visit
│   │   │   │   └── prompts.py
│   │   │   ├── analyst/
│   │   │   │   ├── agent.py           # AnalystAgent (extraction documents)
│   │   │   │   ├── tools.py           # extract_dpe, extract_copro, estimate_price
│   │   │   │   └── prompts.py
│   │   │   ├── writer/
│   │   │   │   ├── agent.py           # WriterAgent (annonces + emails)
│   │   │   │   ├── tools.py           # generate_listing, generate_email
│   │   │   │   ├── prompts.py
│   │   │   │   └── templates/
│   │   │   │       ├── leboncoin.py
│   │   │   │       ├── seloger.py
│   │   │   │       └── website.py
│   │   │   ├── voice/
│   │   │   │   ├── agent.py           # VoiceAgent (pipeline STT→LLM→TTS)
│   │   │   │   ├── stt.py             # Whisper integration
│   │   │   │   ├── tts.py             # OpenAI TTS integration
│   │   │   │   └── prompts.py
│   │   │   └── orchestrator/
│   │   │       ├── agent.py           # Orchestrateur LangGraph
│   │   │       ├── workflows/
│   │   │       │   ├── new_property.py
│   │   │       │   └── incoming_email.py
│   │   │       └── state.py           # State models LangGraph
│   │   ├── ingestion/
│   │   │   ├── csv_importer.py        # Import CSV des biens
│   │   │   ├── document_loader.py     # Extraction texte PDF
│   │   │   └── embedder.py            # Génération embeddings + indexation pgvector
│   │   ├── services/
│   │   │   ├── email_service.py       # SendGrid
│   │   │   ├── calendar_service.py    # Google Calendar API
│   │   │   ├── twilio_service.py      # Twilio (appels)
│   │   │   └── storage_service.py     # Stockage fichiers local
│   │   └── tasks/
│   │       ├── celery_app.py
│   │       └── document_tasks.py      # Analyse PDF async
├── frontend/
│   ├── dashboard/                     # React + Tailwind
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── Dashboard.jsx      # Stats + dernières actions
│   │       │   ├── Properties.jsx     # Liste biens + import CSV
│   │       │   ├── Conversations.jsx  # Historique chatbot
│   │       │   ├── Listings.jsx       # Annonces générées
│   │       │   ├── Documents.jsx      # Documents analysés
│   │       │   └── Settings.jsx       # Configuration agence
│   │       └── components/
│   └── widget/                        # Chatbot intégrable
│       ├── widget.js
│       ├── widget.css
│       └── iframe.html
├── tests/
│   ├── test_agents/
│   │   ├── test_support_agent.py
│   │   ├── test_analyst_agent.py
│   │   └── test_writer_agent.py
│   ├── test_api/
│   │   ├── test_properties.py
│   │   ├── test_chat.py
│   │   └── test_documents.py
│   └── conftest.py
├── alembic/
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
├── .env.example
├── .github/workflows/
│   ├── test.yml
│   └── deploy.yml
└── README.md
```

---

## 7. Plan de développement

### Phase 1 — Foundation `[EN COURS]`
**Durée estimée** : 1 semaine

- [ ] Setup FastAPI + PostgreSQL + pgvector + Redis
- [ ] Modèles SQLAlchemy complets + migration Alembic
- [ ] Auth JWT (login, token, dépendance FastAPI)
- [ ] Import CSV des biens + génération embeddings pgvector
- [ ] Docker Compose fonctionnel (app + postgres + redis + celery)
- [ ] Tests de base (conftest, fixtures)

**Critère de succès** : `docker-compose up` → API accessible, import CSV de 20 biens fictifs → embeddings générés, requête vectorielle retourne des résultats.

---

### Phase 2 — Agent Support + Widget
**Durée estimée** : 1-1.5 semaine

- [ ] SupportAgent complet (extraction critères → RAG → filtre SQL → réponse)
- [ ] WebSocket chat (FastAPI)
- [ ] Intégration Google Calendar (créneaux disponibles)
- [ ] Logique d'escalade (confiance < 0.7 → email)
- [ ] Widget JS vanilla (iframe, déclencheur bouton, styles)

**Critère de succès** : Widget sur une page HTML fictive ImmoPlus → conversation complète → visite bookée dans Google Calendar.

---

### Phase 3 — Agent Rédacteur
**Durée estimée** : 0.5-1 semaine

- [ ] WriterAgent (generation listing par plateforme)
- [ ] Templates LeBonCoin / SeLoger / website
- [ ] Génération email suivi post-visite
- [ ] Page Listings dans le dashboard (bouton "Générer" + validation)

**Critère de succès** : Depuis le dashboard → clic "Générer annonce SeLoger" → texte optimisé affiché en draft.

---

### Phase 4 — Agent Analyste
**Durée estimée** : 1 semaine

- [ ] Upload PDF → classification type document
- [ ] Extraction JSON structurée (DPE, copro, mandat)
- [ ] Traitement Celery async
- [ ] Indexation pgvector du texte complet
- [ ] Page Documents dans le dashboard (statut, données extraites)

**Critère de succès** : Upload d'un vrai DPE PDF → données (classe, consommation, CO2) extraites et affichées < 30 secondes.

---

### Phase 5 — Orchestrateur LangGraph
**Durée estimée** : 1 semaine

- [ ] Workflow `new_property` (analyste → rédacteur → notification)
- [ ] Workflow `incoming_email` (classification → support ou escalade)
- [ ] StateModel Pydantic
- [ ] Endpoint `/api/workflows/{workflow_name}` (déclenchement REST)

**Critère de succès** : POST `/api/workflows/new_property` avec un property_id → annonce générée + email de notification dans les logs.

---

### Phase 6 — Agent Vocal
**Durée estimée** : 1-1.5 semaine

- [ ] WebSocket audio bidirectionnel
- [ ] Pipeline Whisper → GPT-4o-mini → OpenAI TTS
- [ ] Détection fin de phrase (pause > 1.5s)
- [ ] Streaming TTS (latence réduite)
- [ ] Webhook Twilio → pipeline vocal

**Critère de succès** : Appel sur le numéro Twilio de démo → conversation naturelle sur un bien → visite bookée. Latence < 3s.

---

### Phase 7 — Dashboard complet + Déploiement
**Durée estimée** : 1 semaine

- [ ] Dashboard React finalisé (toutes les pages)
- [ ] README soigné (architecture, GIF démo, instructions setup)
- [ ] Données fictives ImmoPlus seedées (20 biens, conversations, documents)
- [ ] Déploiement Railway/Render (PostgreSQL managed)
- [ ] GitHub Actions CI (tests sur PR)
- [ ] URL de démo publique fonctionnelle

**Critère de succès** : URL de démo publique partageable → toutes les fonctionnalités démontrables en 5 minutes.

---

## 8. Variables d'environnement

```env
# Base de données
DATABASE_URL=postgresql://user:pass@localhost:5432/autopilot

# Cache / Queue
REDIS_URL=redis://localhost:6379/0

# IA
OPENAI_API_KEY=sk-...

# Téléphonie
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+33...

# Email
SENDGRID_API_KEY=...

# Calendrier
GOOGLE_CALENDAR_CREDENTIALS=./credentials.json

# App
SECRET_KEY=...
ALLOWED_ORIGINS=http://localhost:3000,https://demo.autopilot-immo.fr
```

---

## 9. Critères de qualité portfolio

Pour que ce projet serve efficacement de portfolio :

- [ ] **Demo live** : URL publique accessible, données fictives réalistes
- [ ] **README** : architecture diagram, GIF/vidéo démo, instructions de setup en < 5 commandes
- [ ] **Code propre** : pas de TODO non résolus, pas de credentials en dur, pas de dead code
- [ ] **Tests** : couverture des agents et routes principales
- [ ] **Git** : historique propre, commits sémantiques, pas de fichiers inutiles

---

## 10. Risques identifiés

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Latence vocale > 3s | Haute | Moyen | Streaming TTS + GPT-4o-mini + mesures dès Phase 6 |
| Coûts OpenAI en développement | Faible | Faible | Mock LLM dans les tests, `.env` de test |
| Twilio — configuration WebSocket | Moyenne | Moyen | Tester la démo voice en Phase 6 dédiée |
| pgvector — qualité des embeddings | Faible | Moyen | Données de test suffisamment diversifiées |
