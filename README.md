# AutoPilot Immo 🏠

> Système multi-agents IA pour agences immobilières — projet portfolio freelance

**AutoPilot Immo** automatise les tâches répétitives d'une agence immobilière grâce à 4 agents IA orchestrés : chatbot RAG 24/7, rédacteur d'annonces, analyste de documents PDF, et assistant vocal téléphonique.

---

## Démonstration live

| Interface | URL |
|---|---|
| Dashboard de gestion | `/dashboard` |
| Chatbot prospect | `/widget/demo.html` |
| Assistant vocal | `/widget/voice_demo.html` |
| API Swagger | `/docs` |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FastAPI (Python 3.11)                 │
│                                                              │
│  /auth  /properties  /chat  /listings  /documents  /voice   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ SupportAgent │  │ WriterAgent  │  │  AnalystAgent    │  │
│  │ LangGraph    │  │ LangGraph    │  │  LangGraph       │  │
│  │              │  │              │  │                  │  │
│  │ RAG pgvector │  │ 3 plateformes│  │ PDF → structured │  │
│  │ GPT-4o-mini  │  │ GPT-4o-mini  │  │ GPT-4o           │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   VoiceAgent                          │   │
│  │   Whisper STT → GPT-4o-mini + RAG → OpenAI TTS-1    │   │
│  │   Twilio webhook (production) / Browser demo (local)  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │                           │
    PostgreSQL 16                  Redis
    + pgvector                  + Celery
```

## Stack technique

| Couche | Technologies |
|---|---|
| **Backend** | Python 3.11, FastAPI, SQLAlchemy 2, Alembic |
| **Base de données** | PostgreSQL 16 + pgvector (recherche vectorielle) |
| **Cache / Queue** | Redis + Celery |
| **IA** | LangGraph, OpenAI (GPT-4o-mini, GPT-4o, Whisper, TTS-1) |
| **Frontend** | React 18 + Tailwind CSS (dashboard), Vanilla JS (widget) |
| **Déploiement** | Docker, Render, GitHub Actions CI/CD |
| **Téléphonie** | Twilio (webhooks voix) |

---

## Les 4 agents IA

### 1. Agent Support — Chatbot RAG 24/7
Pipeline LangGraph : `extract_criteria` → `search_properties` → `generate_response`
- Extrait les critères de recherche du message (budget, surface, ville…)
- Recherche les biens par similarité vectorielle (pgvector cosine distance)
- Génère une réponse contextualisée avec GPT-4o-mini
- Widget JS intégrable sur n'importe quel site

### 2. Agent Rédacteur — Annonces multi-plateformes
Pipeline LangGraph : `load_property` → `generate_drafts` → `save_drafts`
- Génère des annonces adaptées à chaque plateforme (Leboncoin, SeLoger, site web)
- Respecte les contraintes de chaque plateforme (ton, longueur, mots-clés)
- Workflow d'approbation avant publication

### 3. Agent Analyste — Extraction PDF
Pipeline LangGraph : `extract_text` → `classify_document` → `extract_structured_data` → `save_results`
- Extraction de texte avec pdfplumber
- Classification automatique : DPE, copropriété, mandat, autre
- Extraction structurée avec GPT-4o (champs typés selon le document)

### 4. Agent Vocal — Téléphonie IA
Pipeline : `Whisper STT` → `SupportAgent RAG` → `OpenAI TTS-1`
- Transcription vocale avec Whisper-1
- Réponse contextualisée avec accès au catalogue immobilier
- Synthèse vocale OpenAI TTS-1
- Webhooks Twilio pour appels téléphoniques entrants

---

## Installation locale

### Prérequis
- Python 3.11+, Node 20+, Docker Desktop

### Démarrage rapide

```bash
# 1. Cloner et configurer
git clone https://github.com/TON_GITHUB/autopilot-immo.git
cd autopilot-immo
cp .env.example .env
# Éditer .env avec votre clé OpenAI

# 2. Démarrer PostgreSQL + Redis
docker compose up -d postgres redis

# 3. Backend
python -m venv venv
source venv/bin/activate  # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000 --app-dir backend

# 4. Dashboard (autre terminal)
cd frontend/dashboard
npm install
npm run dev
```

### URLs locales
- API : http://localhost:8000
- Dashboard : http://127.0.0.1:3000
- Chatbot démo : http://localhost:8000/widget/demo.html
- Vocal démo : http://localhost:8000/widget/voice_demo.html

---

## Déploiement Render

```bash
# Pousser sur GitHub → Render détecte render.yaml automatiquement
git push origin main
```

Variables d'environnement à configurer sur Render :
- `OPENAI_API_KEY`
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- `ALLOWED_ORIGINS` (URL de production)
- `TWILIO_*` (optionnel — agent vocal)

---

## Structure du projet

```
autopilot-immo/
├── backend/
│   └── app/
│       ├── agents/          # SupportAgent, WriterAgent, AnalystAgent, VoiceAgent
│       ├── api/routes/      # auth, properties, chat, listings, documents, voice
│       ├── database/        # models, connection, vector_store
│       ├── ingestion/       # csv_importer, embedder
│       └── tasks/           # Celery tasks
├── frontend/
│   ├── dashboard/           # React + Tailwind (gestion agence)
│   └── widget/              # Chatbot JS + Voice demo
├── data/
│   └── sample_properties.csv
├── tests/
├── Dockerfile
├── docker-compose.yml
└── render.yaml
```

---

## Contact

Projet développé par **[Ton Nom]** — Développeur IA Freelance  
📧 [ton@email.com] | 🔗 [linkedin.com/in/...] | 🐙 [github.com/...]
