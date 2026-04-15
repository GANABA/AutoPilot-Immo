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
- [x] `GET /settings` — retourner les settings du tenant courant
- [x] `PATCH /settings` — mettre à jour un sous-ensemble des settings
- [x] `POST /settings/crawl-website` — déclencher le crawl du site web
- [x] Validation du schéma settings (Pydantic) avec valeurs par défaut
- [x] Tous les agents lisent leur config depuis `tenant.settings` (plus de constantes)
- [x] Web crawler : `requests` + `BeautifulSoup` → chunks → embeddings → pgvector (`source_type="website"`)
- [x] Modèle pgvector : `KnowledgeChunk` avec `source_type`, `source_id`, `title`, `content`, `embedding`

#### Dashboard
- [x] Page Settings avec sections :
  - Informations agence (nom, logo, adresse, contact)
  - Widget chat (couleur, message d'accueil, comportement)
  - Horaires de travail (grille par jour, ouverture/fermeture)
  - Calendrier (durée visites, délais, email agent)
  - Emails (expéditeur, délai relance, toggles)
  - Agent vocal (message d'accueil, transfert, Vapi ID)
  - IA (ton, langue, nombre de biens, réponse hors-scope)
- [x] Section "Site web agence" : URL + bouton "Indexer le site" + statut dernier crawl

---

### Phase 2 — Gestion des biens (workflow complet)

#### Modèle de données — enrichissements
- [x] Nouveaux champs `Property` :
  - `mandate_ref`, `mandate_type` (vente/location), `agency_fees_percent`
  - `ges_class`, `annual_energy_cost`
  - `charges_monthly` (existant), `lot_count`, `syndic_name`
  - `has_cellar`, `has_garden`, `orientation`
  - `diagnostics` (JSON : plomb, amiante, électricité, gaz)
  - `status_workflow` : `draft` → `review` → `active` → `sold` / `rented`
- [x] Migration inline via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` dans `init_db()`

#### Workflow document-first
- [x] `POST /documents/upload-orphan` — upload PDF sans property_id → classification → extraction → retour `PropertyDraft`
- [x] Dashboard : "Importer depuis document" → analyse IA → formulaire pré-rempli → créer bien

#### Workflow form-first
- [x] `POST /properties` — création bien avec champs requis, `status_workflow="draft"` par défaut
- [x] Upload de documents successifs par bien → enrichissement incrémental (ne remplace pas les champs existants)
- [x] `AnalystAgent._enrich_property()` — map extraction → champs Property selon le type de doc

#### Gestion des photos
- [x] `POST /properties/{id}/photos` — upload N images, append à `Property.photos`
- [x] `DELETE /properties/{id}/photos?url=...` — suppression d'une photo
- [x] Stockage local `/data/uploads/properties/{id}/`
- [x] Servi via FastAPI StaticFiles sur `/data/uploads/`
- [x] `Property.photos` = liste ordonnée d'URLs (vraies photos utilisées dans le chatbot)

#### Types de documents et champs extraits
| Type | Champs extraits |
|---|---|
| DPE | `energy_class`, `ges_class`, `annual_energy_cost`, `surface` |
| Mandat | `price`, `mandate_ref`, `mandate_type`, `agency_fees_percent` |
| Règlement copro | `charges_monthly`, `lot_count`, `syndic_name` |
| Diagnostic technique | `diagnostics.{lead_paint,asbestos,electrical,gas,termites,flood_risk}` |
| Autre | JSON libre (max 10 champs) |

---

### Phase 3 — Agent Support (production-grade)

#### Outil de recherche site web
- [x] Recherche dans pgvector avec `source_type = "website"` (via `search_knowledge_chunks`)
- [x] Contexte web injecté dans le prompt LLM si chunks disponibles
- [x] Activé uniquement si des chunks existent pour le tenant

#### Gestion des scénarios hors-périmètre
- [x] Réponse configurée depuis `settings.ai.out_of_scope_response`
- [x] Contact agence (téléphone + email) injecté automatiquement dans la réponse hors-scope

#### Gestion des horaires
- [x] `_is_within_working_hours(tenant_settings)` — vérifie l'heure Paris (via `zoneinfo`)
- [x] Hors horaires : message automatique avec contacts agence + demande d'email callback
- [x] Court-circuite l'agent (pas d'appel OpenAI inutile)

#### Escalade vers humain
- [x] Trigger automatique après `settings.ai.escalate_after_turns` tours sans email capturé
- [x] Email de notification à l'agent avec prospect + critères + lien conversation
- [x] Sentinel `ESCALATION_SENT:...` en BDD pour éviter les doubles envois
- [x] Message d'escalade affiché au prospect dans le chat
- [ ] Trigger manuel (prospect demande explicitement) — géré partiellement par le prompt LLM

#### UX carrousel horizontal
- [x] `.ap-property-cards` : flex row, `overflow-x: auto`, `scroll-snap-type: x mandatory`
- [x] Touch swipe natif via `-webkit-overflow-scrolling: touch`
- [x] Dots de navigation cliquables avec mise à jour au scroll
- [x] "Glissez pour voir plus" hint (disparaît au premier scroll)
- [x] Photos réelles si disponibles, fallback Unsplash + `onerror` fallback
- [x] `data-open-delay` configurable sur la balise `<script>`

#### Scheduling avancé
- [ ] Négociation de créneaux : "pas jeudi, vous avez vendredi ?" — prévu Phase suivante

---

### Phase 4 — Agent Vocal (Vapi)

#### Setup Vapi
- [x] Créer compte Vapi
- [x] Configurer assistant : STT Deepgram, TTS ElevenLabs/OpenAI, Custom LLM
- [x] Brancher numéro Twilio dans Vapi
- [x] Stocker `vapi_assistant_id` dans `settings.voice`

#### Backend — nouveau voice.py
- [x] Supprimer : `_TASKS`, `_run_voice_task`, `_openai_tts`, `twilio_gather`, `twilio_respond`
- [x] `POST /voice/vapi/chat` — endpoint custom LLM (compatible OpenAI)
  - Reçoit l'historique de conversation de Vapi
  - Lance le SupportAgent avec l'historique
  - Retourne la réponse texte au format OpenAI
  - Sauvegarde en BDD (Conversation + Messages)
  - Gestion `session_slots` par `call_id` (in-memory dict)
- [x] `POST /voice/vapi/events` — server messages Vapi
  - `call-started` : créer Conversation en BDD, lier au numéro appelant
  - `end-of-call-report` : sauvegarder transcript, durée, résumé
  - `transfer-destination-request` : retourner le numéro de transfert depuis settings

#### Fonctionnalités vocales
- [x] Identification par numéro de téléphone (si prospect connu → `contact_captured = True`)
- [x] Hors horaires : message d'accueil différent + collecte callback
- [x] Résumé automatique d'appel (GPT) → sauvegardé en BDD → visible dashboard
- [x] Transfert vers agent humain si demandé (`settings.voice.transfer_number`)

---

### Phase 5 — Dashboard CRM & Analytics

#### Vue Prospects (CRM)
- [x] Pipeline Kanban : Nouveau → Qualifié → RDV planifié → Fermé
- [x] Fiche prospect : nom, email, téléphone, historique conversations, critères, résumé appel
- [x] Actions rapides : envoyer email, changer statut, notes internes
- [x] Filtres : par canal, recherche texte (nom / email / téléphone)
- [x] Export CSV (`GET /prospects/export`)

#### Vue Agenda
- [x] Liste des visites planifiées (statut `visit_booked`) avec contacts et critères
- [x] Info bloc Google Calendar (configuration depuis les paramètres)
- [ ] Annulation / modification de RDV depuis le dashboard — prévu Phase suivante
- [ ] Rappel automatique 24h avant visite — prévu Phase suivante

#### Analytics
- [x] Volume de conversations sur période configurable (7/14/30/90 jours)
- [x] Taux de qualification, taux de RDV, taux de fermeture
- [x] Timeline conversations par jour (mini graphe barres)
- [x] Répartition par canal et par statut
- [x] Top types de biens et villes recherchés
- [x] Budget moyen et surface moyenne recherchés

#### Notifications temps réel
- [x] `Notification` model + `POST /notifications` (persist + broadcast)
- [x] WebSocket `/notifications/ws` — push temps réel vers le dashboard
- [x] `NotificationBell` composant : badge non-lus, panel déroulant, marquer lu
- [x] Événements notifiés : nouveau prospect qualifié, RDV confirmé, appel terminé, escalade

---

### Phase 6 — Orchestrateur (robuste)

#### Algorithme de matching (scoring)
- [x] Score 0-100 par prospect sur chaque nouveau bien
  - Type exact : +30 pts · Ville : +25 pts · Budget : +20 pts · Surface : +15 pts · Pièces : +10 pts
  - Crédit partiel si budget 0-10% au-dessus, surface 0-15% en dessous
- [x] Seuil configurable depuis `settings.ai.match_score_threshold` (défaut : 60/100)
- [x] Tri des prospects par score décroissant, top 5 dans le résumé

#### Robustesse
- [x] Retry × 2 par étape (analyst, writer) — si les 2 tentatives échouent, on continue
- [x] `WorkflowRun` model : `steps` JSON, `status`, `summary`, `started_at`, `completed_at`
- [x] Broadcast WS `workflow_step` à chaque étape → visible en temps réel
- [x] Notifications : workflow démarré + workflow terminé (avec résumé)
- [x] `GET /workflows/runs` — historique consultable par bien
- [x] Onglet "Workflow" dans la fiche bien : bouton déclencher + historique + scores

---

### Phase 7 — Sécurité & Production-readiness

#### Authentification
- [x] Refresh tokens (JWT access 15min + refresh 7j)
- [x] Logout propre (blacklist refresh token dans Redis)
- [x] WebSocket authentifié (token en query param)

#### Rate limiting
- [x] `slowapi` : 60 req/min par IP sur endpoints API
- [x] 10 messages/min par conversation WebSocket
- [x] 5 tentatives de login par minute par IP

#### Validation & sécurité
- [x] Sanitisation de tous les inputs utilisateur (pas d'injection dans les prompts)
- [x] Validation des URLs (website_url) avant utilisation
- [x] Taille max des fichiers uploadés (PDF : 10 Mo, photos : 5 Mo)
- [x] CORS : liste blanche des domaines autorisés depuis settings

#### Monitoring
- [x] Logging structuré (JSON) avec niveau configurable
- [x] Health check enrichi : DB, Redis, OpenAI API, Vapi
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
