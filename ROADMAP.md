# AutoPilot Immo — Roadmap de Production

**Version** : 2.0  
**Date de révision** : 2026-04-14  
**Statut** : En développement actif — Pivot démo → Production  
**Objectif** : Système multi-agents IA immobilier prêt à être installé chez une vraie agence

---

## Contexte du pivot

La v1.0 était une démonstration portfolio (happy path, tenant hardcodé, logique minimale).  
La v2.0 est un produit réel : configurable, robuste, sécurisé, multi-scénarios.

---

## État actuel (v1.0 — acquis)

### Ce qui est fonctionnel et conservé
| Composant | État | Notes |
|---|---|---|
| FastAPI + PostgreSQL + pgvector | ✅ Solide | Aucun changement architectural |
| Agent Analyste PDF | ✅ Fonctionnel | Extraction DPE, copro, mandat |
| Agent Rédacteur | ✅ Fonctionnel | LeBonCoin, SeLoger, site web |
| Pipeline RAG pgvector | ✅ Solide | Embeddings OpenAI, recherche vectorielle |
| Auth JWT | ✅ Fonctionnel | À renforcer (refresh tokens) |
| Docker Compose | ✅ Fonctionnel | Render deploy |

### Ce qui est partiel et sera refactorisé
| Composant | Problème | Solution v2.0 |
|---|---|---|
| Agent Support (chat) | Happy path uniquement, pas de cas limites | Refonte complète |
| Agent Vocal (Twilio custom) | Latence 3-5s, architecture fragile | Remplacement par Vapi |
| Dashboard React | 4 pages basiques, pas de CRM réel | Refonte UX complète |
| Orchestrateur | Matching binaire, pas de scoring | Algorithme de scoring |
| Paramètres | Hardcodés dans le code | Page settings configurable |
| Biens | Pas de workflow document-first, pas de vraies photos | Workflow complet |

---

## Décisions d'architecture v2.0

### D1 — Paramètres agence dans `Tenant.settings` (JSON)
Toute configuration variable est stockée dans le champ `settings` du tenant.  
Les agents lisent leur config depuis la BDD, jamais depuis des constantes hardcodées.  
**Impact** : déploiement multi-agences possible sans modification de code.

### D2 — Remplacement de Twilio custom par Vapi
Vapi gère nativement : Twilio, STT (Deepgram), TTS, interruptions, timeouts.  
Notre backend expose un endpoint custom LLM (compatible OpenAI) que Vapi appelle.  
**Impact** : latence ~800ms vs 3-5s, code voice.py passe de ~250 à ~80 lignes.

### D3 — Double workflow de création de bien
- **Document-first** : upload PDF → extraction → bien créé en draft
- **Form-first** : saisie manuelle → bien en draft → enrichissement par documents successifs  
Les deux coexistent. Un bien peut recevoir N documents de types différents.

### D4 — Outil web scraping pour l'agent support
Si l'agence a un site web, son contenu est crawlé et indexé dans pgvector (`source_type = "website"`).  
L'agent support fait une double recherche : catalogue biens + contenu site.  
Recrawl déclenché manuellement depuis les settings ou automatiquement si l'URL change.

### D5 — Photos réelles des biens
`Property.photos` (champ JSON déjà existant) stocke les URLs des photos uploadées.  
Les cartes du chat utilisent la vraie première photo si disponible, sinon fallback Unsplash.

### D6 — Carrousel horizontal dans le chat
Les fiches biens sont affichées en liste scrollable horizontalement (pas empilées).  
Chaque carte est liée à son bien réel avec photo, prix, surface, localisation.

### D7 — Sécurité production
Rate limiting par IP et par tenant, WebSocket authentifié, sanitisation des inputs,  
validation des variables d'environnement au démarrage, CORS strict par domaine.

### D8 — Architecture multi-tenant ready
Le code est écrit pour supporter plusieurs agences (tenant_id partout).  
La v2.0 reste mono-tenant en déploiement, mais l'architecture ne l'impose pas.

---

## Schéma des paramètres agence (Tenant.settings)

```json
{
  "agency": {
    "name": "ImmoPlus Lyon",
    "logo_url": "https://...",
    "address": "12 rue de la République, 69001 Lyon",
    "phone": "+33 4 72 00 00 00",
    "email": "contact@immoplus.fr",
    "website_url": "https://www.immoplus.fr",
    "website_crawled_at": null
  },
  "chat_widget": {
    "welcome_message": "Bonjour, bienvenue chez ImmoPlus !",
    "primary_color": "#1d4ed8",
    "avatar_url": null,
    "auto_open_delay_seconds": 3,
    "placeholder_text": "Décrivez votre recherche…",
    "position": "bottom-right"
  },
  "working_hours": {
    "monday":    {"open": "09:00", "close": "19:00", "enabled": true},
    "tuesday":   {"open": "09:00", "close": "19:00", "enabled": true},
    "wednesday": {"open": "09:00", "close": "19:00", "enabled": true},
    "thursday":  {"open": "09:00", "close": "19:00", "enabled": true},
    "friday":    {"open": "09:00", "close": "18:00", "enabled": true},
    "saturday":  {"open": "10:00", "close": "17:00", "enabled": false},
    "sunday":    {"open": null,    "close": null,    "enabled": false}
  },
  "calendar": {
    "provider": "google",
    "calendar_id": "contact@immoplus.fr",
    "visit_duration_minutes": 60,
    "min_booking_advance_hours": 24,
    "max_booking_advance_days": 30,
    "agent_email": "contact@immoplus.fr"
  },
  "email": {
    "sender_name": "ImmoPlus",
    "sender_email": "contact@immoplus.fr",
    "followup_delay_days": 7,
    "send_prospect_confirmation": true,
    "send_agent_notification": true,
    "send_visit_confirmation": true
  },
  "voice": {
    "provider": "vapi",
    "vapi_assistant_id": null,
    "greeting": "Bonjour, vous êtes bien chez ImmoPlus. Comment puis-je vous aider ?",
    "out_of_hours_message": "Notre agence est fermée. Laissez-nous votre numéro, nous vous rappelons dès demain matin.",
    "transfer_number": null,
    "transfer_on_request": true
  },
  "ai": {
    "tone": "professionnel",
    "language": "fr",
    "max_properties_shown": 3,
    "escalate_after_turns": 10,
    "out_of_scope_response": "Je suis spécialisé dans la recherche de biens à la vente. Pour toute autre demande, contactez-nous au 04 72 00 00 00."
  }
}
```

---

## Phases d'implémentation

---

### Phase 1 — Paramètres & Configuration agence
**Priorité : Critique — débloque toutes les phases suivantes**

#### Backend
- [ ] `GET /settings` — retourner les settings du tenant courant
- [ ] `PATCH /settings` — mettre à jour un sous-ensemble des settings
- [ ] `POST /settings/crawl-website` — déclencher le crawl du site web
- [ ] Validation du schéma settings (Pydantic) avec valeurs par défaut
- [ ] Tous les agents lisent leur config depuis `tenant.settings` (plus de constantes)
- [ ] Web crawler : `requests` + `BeautifulSoup` → chunks → embeddings → pgvector (`source_type="website"`)
- [ ] Modèle pgvector : ajouter `source_type` et `source_id` à la table des embeddings

#### Dashboard
- [ ] Page Settings avec sections :
  - Informations agence (nom, logo, adresse, contact)
  - Widget chat (couleur, message d'accueil, comportement)
  - Horaires de travail (grille par jour, ouverture/fermeture)
  - Calendrier (durée visites, délais, email agent)
  - Emails (expéditeur, délai relance, toggles)
  - Agent vocal (message d'accueil, transfert, Vapi ID)
  - IA (ton, langue, nombre de biens, réponse hors-scope)
- [ ] Section "Site web agence" : URL + bouton "Indexer le site" + statut dernier crawl

---

### Phase 2 — Gestion des biens (workflow complet)

#### Modèle de données — enrichissements
- [ ] Nouveaux champs `Property` :
  - `mandate_ref`, `mandate_type` (vente/location), `agency_fees_percent`
  - `ges_class`, `annual_energy_cost`
  - `monthly_charges`, `lot_count`, `syndic_name`
  - `has_cellar`, `has_garden`, `orientation`
  - `diagnostics` (JSON : plomb, amiante, électricité, gaz)
  - `status_workflow` : `draft` → `review` → `active` → `sold` / `rented`
- [ ] Migration Alembic

#### Workflow document-first
- [ ] Upload PDF sans bien associé → classification → extraction → création bien en draft
- [ ] Dashboard : "Importer depuis document" → formulaire pré-rempli → compléter et valider

#### Workflow form-first
- [ ] Création bien avec champs requis uniquement (type, titre, ville, prix, surface, pièces)
- [ ] Statut `draft` par défaut
- [ ] Upload de documents successifs par bien → enrichissement incrémental
- [ ] Chaque extraction fusionne ses données sans écraser les champs déjà renseignés

#### Gestion des photos
- [ ] Upload photos par bien (endpoint `POST /properties/{id}/photos`)
- [ ] Stockage : local `/data/uploads/properties/{id}/` ou URL externe
- [ ] Ordre des photos (drag & drop dans le dashboard)
- [ ] `Property.photos` = liste ordonnée d'URLs

#### Types de documents et champs extraits
| Type | Champs extraits |
|---|---|
| DPE | `energy_class`, `ges_class`, `annual_energy_cost`, `surface` |
| Mandat | `price`, `mandate_ref`, `mandate_type`, `agency_fees_percent` |
| Règlement copro | `monthly_charges`, `lot_count`, `syndic_name` |
| Diagnostic technique | `diagnostics.lead_paint`, `.asbestos`, `.electrical`, `.gas` |
| Plan | `surface`, description textuelle des pièces |

---

### Phase 3 — Agent Support (production-grade)

#### Outil de recherche site web
- [ ] Nouveau nœud LangGraph `search_website` (entre `search_properties` et `detect_contact`)
- [ ] Recherche dans pgvector avec `source_type = "website"`
- [ ] Activé seulement si `tenant.settings.agency.website_url` est configuré et crawlé
- [ ] Le contexte web est injecté dans le prompt si pertinent (honoraires, secteurs, services)

#### Gestion des scénarios hors-périmètre
- [ ] Détection des requêtes hors-scope : location, gestion locative, estimation, juridique
- [ ] Réponse configurée depuis `settings.ai.out_of_scope_response`
- [ ] Proposition de contact direct (téléphone, email) depuis les settings

#### Gestion des horaires
- [ ] Vérification des `working_hours` à chaque message
- [ ] Hors horaires : message configuré + collecte email pour callback
- [ ] Week-end / jours fériés : message adapté

#### Escalade vers humain
- [ ] Trigger automatique après `settings.ai.escalate_after_turns` tours sans résolution
- [ ] Trigger manuel : prospect demande explicitement à parler à quelqu'un
- [ ] Action escalade : notification email/SMS à l'agent + message prospect

#### UX carrousel horizontal
- [ ] CSS : `.ap-property-cards` en flex scroll horizontal
- [ ] Swipe tactile sur mobile
- [ ] Photos réelles si `Property.photos` non vide, fallback Unsplash sinon
- [ ] Indicateur de scroll (flèches ou dots)

#### Scheduling avancé
- [ ] Négociation de créneaux : "pas jeudi, vous avez vendredi ?"
- [ ] Proposition alternative si créneau refusé
- [ ] Annulation / modification de RDV depuis le chat

---

### Phase 4 — Agent Vocal (Vapi)

#### Setup Vapi
- [ ] Créer compte Vapi
- [ ] Configurer assistant : STT Deepgram, TTS ElevenLabs/OpenAI, Custom LLM
- [ ] Brancher numéro Twilio dans Vapi
- [ ] Stocker `vapi_assistant_id` dans `settings.voice`

#### Backend — nouveau voice.py
- [ ] Supprimer : `_TASKS`, `_run_voice_task`, `_openai_tts`, `twilio_gather`, `twilio_respond`
- [ ] `POST /voice/vapi/chat` — endpoint custom LLM (compatible OpenAI)
  - Reçoit l'historique de conversation de Vapi
  - Lance le SupportAgent avec l'historique
  - Retourne la réponse texte au format OpenAI
  - Sauvegarde en BDD (Conversation + Messages)
  - Gestion `session_slots` par `call_id` (in-memory dict)
- [ ] `POST /voice/vapi/events` — server messages Vapi
  - `call-started` : créer Conversation en BDD, lier au numéro appelant
  - `end-of-call-report` : sauvegarder transcript, durée, résumé
  - `function-call` : exécuter outils (search, booking) si mode tool-calling

#### Fonctionnalités vocales
- [ ] Identification par numéro de téléphone (si prospect connu → `contact_captured = True`)
- [ ] Hors horaires : message d'accueil différent + collecte callback
- [ ] Résumé automatique d'appel (GPT) → sauvegardé en BDD → visible dashboard
- [ ] Transfert vers agent humain si demandé (`settings.voice.transfer_number`)

---

### Phase 5 — Dashboard CRM & Analytics

#### Vue Prospects (CRM)
- [ ] Pipeline Kanban : Nouveau → Qualifié → RDV planifié → Converti → Perdu
- [ ] Fiche prospect : nom, email, téléphone, historique conversations, critères, RDVs
- [ ] Actions rapides : envoyer email, planifier rappel, changer statut
- [ ] Filtres : par statut, date, source (chat/vocal/email), critères de recherche
- [ ] Export CSV

#### Vue Agenda
- [ ] Calendrier mensuel/hebdomadaire des visites confirmées
- [ ] Créneaux disponibles vs occupés (sync Google Calendar)
- [ ] Annulation / modification de RDV depuis le dashboard
- [ ] Rappel automatique 24h avant visite (email prospect + agent)

#### Analytics
- [ ] Volume de conversations par jour/semaine/mois
- [ ] Taux de qualification (conversations avec email capturé / total)
- [ ] Taux de conversion RDV (RDV confirmés / qualifiés)
- [ ] Temps de réponse moyen
- [ ] Top recherches (critères les plus fréquents)
- [ ] Performances par canal (chat, vocal, email)

#### Notifications temps réel
- [ ] WebSocket dashboard : nouveau prospect, nouveau RDV, nouvel appel
- [ ] Centre de notifications (cloche) avec historique
- [ ] Badges sur les menus (X nouveaux prospects, Y RDVs aujourd'hui)

---

### Phase 6 — Orchestrateur (robuste)

#### Algorithme de matching (scoring)
- [ ] Score 0-100 par prospect sur chaque nouveau bien
  - Type exact : +30 pts
  - Ville correspondante : +25 pts
  - Budget dans la fourchette : +20 pts
  - Surface minimale respectée : +15 pts
  - Nombre de pièces : +10 pts
- [ ] Seuil configurable (défaut : 60/100 pour être notifié)
- [ ] Tri des prospects par score décroissant

#### Robustesse
- [ ] Retry par étape (si step analyst échoue → on continue avec writer)
- [ ] Statut détaillé du workflow en BDD (quelle étape, quel résultat, quelle erreur)
- [ ] Notifications temps réel dashboard via WebSocket pendant l'exécution
- [ ] Historique des workflows exécutés par bien

---

### Phase 7 — Sécurité & Production-readiness

#### Authentification
- [ ] Refresh tokens (JWT access 15min + refresh 7j)
- [ ] Logout propre (blacklist refresh token dans Redis)
- [ ] WebSocket authentifié (token en query param)

#### Rate limiting
- [ ] `slowapi` : 60 req/min par IP sur endpoints API
- [ ] 10 messages/min par conversation WebSocket
- [ ] 3 tentatives de login par minute par IP

#### Validation & sécurité
- [ ] Sanitisation de tous les inputs utilisateur (pas d'injection dans les prompts)
- [ ] Validation des URLs (website_url, photo URLs) avant utilisation
- [ ] Taille max des fichiers uploadés (PDF : 10 Mo, photos : 5 Mo)
- [ ] CORS : liste blanche des domaines autorisés depuis settings

#### Monitoring
- [ ] Logging structuré (JSON) avec niveau configurable
- [ ] Health check enrichi : DB, Redis, OpenAI API, Vapi
- [ ] Alertes email si quota OpenAI dépassé

---

## Ordre d'implémentation — sprint par sprint

| Sprint | Contenu | Dépendances |
|---|---|---|
| **S1** | Phase 1 : Settings backend + page dashboard | — |
| **S2** | Phase 2 : Workflow biens + documents multiples + photos | S1 |
| **S3** | Phase 3 : Agent support (hors-scope, horaires, escalade, carrousel) | S1, S2 |
| **S4** | Phase 4 : Vapi voice agent | S1, S3 |
| **S5** | Phase 5 : Dashboard CRM + analytics + notifications | S1, S2, S3 |
| **S6** | Phase 6 : Orchestrateur scoring + robustesse | S2, S5 |
| **S7** | Phase 7 : Sécurité + production-readiness | Toutes |

---

## Variables d'environnement requises (complètes)

```env
# Core
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
SECRET_KEY=...
ADMIN_EMAIL=...
ADMIN_PASSWORD=...

# OpenAI
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o
OPENAI_MODEL_MINI=gpt-4o-mini

# SendGrid
SENDGRID_API_KEY=...
SENDGRID_FROM_EMAIL=...

# Google Calendar
GOOGLE_CALENDAR_CREDENTIALS_JSON=...
GOOGLE_CALENDAR_ID=...

# Vapi (Phase 4)
VAPI_API_KEY=...
VAPI_WEBHOOK_SECRET=...

# App
PUBLIC_URL=https://your-app.render.com
ALLOWED_ORIGINS=https://your-frontend.com,https://immoplus.fr
```

---

## Stack technique — décisions figées

| Couche | Technologie | Raison |
|---|---|---|
| Backend | FastAPI + Python 3.11 | Async natif, WebSocket, ecosystème IA |
| Base de données | PostgreSQL 16 + pgvector | Vecteurs + SQL dans une seule BDD |
| Cache / Queue | Redis + Celery | Tasks async, Beat pour tâches planifiées |
| IA — LLM | OpenAI GPT-4o / GPT-4o-mini | Qualité, JSON mode, function calling |
| IA — Embeddings | OpenAI text-embedding-3-small | 1536 dims, bon ratio qualité/coût |
| Agent orchestration | LangGraph | Graphes d'état, conditions, boucles |
| Voix | Vapi (STT + TTS + Twilio) | Latence ~800ms, architecture gérée |
| Frontend | React + Tailwind CSS | Dashboard |
| Widget | JS Vanilla | Intégrable partout sans dépendances |
| Déploiement | Render (app + PostgreSQL + Redis) | Simple, managed, free tier disponible |

---

## Ce qui ne sera PAS implémenté (décisions conscientes)

| Feature | Raison |
|---|---|
| Publication API SeLoger/LeBonCoin | API partenaire payante et complexe |
| DVF (estimation prix) | Valeur ajoutée mais scope trop large |
| ElevenLabs TTS custom | Remplacé par Vapi qui gère le TTS |
| Multi-tenant (interface) | Architecture ready, mais UI mono-agence |
| RGPD complet | Hors scope — données fictives pour démo |
| App mobile | Web responsive suffit |

---

*Document maintenu en parallèle du développement. Toute décision technique majeure est ajoutée ici.*
