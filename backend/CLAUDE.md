# Backend — Contexte spécialisé

> Ce fichier complète le CLAUDE.md racine. Il s'applique à tout travail dans `backend/`.

---

## Responsabilités de ce domaine

- API REST + WebSocket (FastAPI)
- Agents LangGraph (logique IA)
- Accès base de données (SQLAlchemy + pgvector)
- Services métier (email, calendrier, scraping)
- Tâches asynchrones (Celery)
- Migrations de schéma (Alembic)

---

## Patterns obligatoires

### Endpoints REST
```python
@router.get("/resource", response_model=ResourceRead)
def get_resource(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),  # si authentifié
):
    ...
```

### Endpoints WebSocket
```python
@router.websocket("/ws/{id}")
async def websocket_endpoint(websocket: WebSocket, id: UUID):
    await websocket.accept()
    db = SessionLocal()
    try:
        ...
    except WebSocketDisconnect:
        logger.info(...)
    except Exception as exc:
        logger.error(...)
    finally:
        try:
            db.close()
        except Exception:
            pass
```

### Agents LangGraph
```python
class MyState(TypedDict):
    db: Any
    tenant_id: str
    # ... champs spécifiques

class MyAgent(BaseAgent):
    def __init__(self, tenant_id: str):
        super().__init__(tenant_id)
        self._client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self._graph = self._build_graph()

    @property
    def agent_name(self) -> str:
        return "my_agent"

    def _node_name(self, state: MyState) -> dict:
        # Retourne seulement les champs modifiés
        return {"field": new_value}

    def _build_graph(self):
        g = StateGraph(MyState)
        g.add_node("node_name", self._node_name)
        g.set_entry_point("node_name")
        g.add_edge("node_name", END)
        return g.compile()

    def run(self, input_data: dict, db: Session) -> dict:
        state = {
            "db": db,
            "tenant_id": self.tenant_id,
            # ... init depuis input_data
        }
        result = self._graph.invoke(state)
        return {
            # ... champs retournés
        }
```

### Schémas Pydantic
```python
class ResourceCreate(BaseModel):
    field: str
    optional_field: str | None = None

class ResourceRead(ResourceCreate):
    id: UUID
    created_at: datetime
    model_config = {"from_attributes": True}
```

---

## Base de données

### Requêtes courantes
```python
# Lookup par slug (tenant)
tenant = db.query(Tenant).filter_by(slug="immoplus").first()

# Filtres multiples
props = db.query(Property).filter(
    Property.tenant_id == tenant.id,
    Property.status == "active",
    Property.price <= max_price,
).order_by(Property.created_at.desc()).limit(20).all()

# Update partiel
conv.prospect_email = detected_email
db.commit()

# Bulk insert
db.add_all([obj1, obj2])
db.commit()
```

### Vecteurs pgvector
```python
from app.database.vector_store import generate_embedding, search_similar_properties

# Générer un embedding
embedding = generate_embedding("texte à vectoriser")

# Recherche vectorielle avec filtres
results = search_similar_properties(
    db=db,
    query_embedding=embedding,
    limit=5,
    min_price=None,
    max_price=280000,
    city="Lyon",
)
```

---

## Services disponibles

### Email (SendGrid)
```python
from app.services.email_service import (
    send_email,                    # bas niveau
    send_prospect_confirmation,    # email prospect après qualif
    send_agent_new_prospect,       # notif agent nouveau prospect
    send_visit_confirmation,       # confirmation RDV
    send_new_property_notification, # nouveau bien pour prospect
    send_orchestrator_summary,     # résumé workflow orchestrateur
)
```

### Calendrier (Google Calendar)
```python
from app.services.calendar_service import (
    get_available_slots,   # retourne list[{label, display, datetime}]
    create_visit_event,    # crée événement, retourne event_id ou "mock-..."
)
```
Si `GOOGLE_CALENDAR_CREDENTIALS_JSON` non configuré → mock automatique (pas d'erreur).

---

## Lecture des settings agence

```python
# Dans un endpoint
tenant = db.query(Tenant).filter_by(slug="immoplus").first()
settings_dict = tenant.settings or {}

greeting = settings_dict.get("chat_widget", {}).get("welcome_message", "Bonjour !")
tone = settings_dict.get("ai", {}).get("tone", "professionnel")
followup_days = settings_dict.get("email", {}).get("followup_delay_days", 7)
```

Ne jamais hardcoder ces valeurs — toujours lire depuis `tenant.settings`.

---

## Logging

```python
logger = logging.getLogger(__name__)

logger.info("Action réussie: %s", detail)
logger.warning("Avertissement non-fatal: %s", detail)
logger.error("Erreur: %s", exc, exc_info=True)  # exc_info=True pour la stack trace
```

---

## Ajouter un nouvel endpoint

1. Créer ou modifier un fichier dans `backend/app/api/routes/`
2. Définir les schémas Pydantic dans `backend/app/api/schemas.py`
3. Ajouter le router dans `backend/app/main.py` si nouveau fichier
4. Tester avec Swagger : `http://localhost:8000/docs`

## Ajouter un nouveau modèle BDD

1. Ajouter la classe dans `backend/app/database/models.py`
2. Créer la migration : `cd backend && alembic revision --autogenerate -m "add xxx"`
3. Vérifier le fichier généré dans `alembic/versions/`
4. Appliquer : `alembic upgrade head`
5. Commit le fichier de migration avec le code
