---
name: new-agent
description: Scaffold a new LangGraph agent for AutoPilot Immo following project conventions. Guides through state definition, node design, graph wiring, endpoint, and integration.
---

# Skill — Créer un nouvel agent LangGraph

Utilise ce workflow pour créer un nouvel agent en suivant les conventions du projet.

## Étape 1 — Définir le périmètre

Répondre à ces questions avant d'écrire une ligne de code :
1. **Quel est le trigger ?** (endpoint API, Celery task, appel depuis un autre agent)
2. **Quelles sont les entrées ?** (ids, textes, fichiers)
3. **Quelles sont les sorties ?** (données structurées, actions, emails, réponses LLM)
4. **Quels nodes LangGraph ?** (liste ordonnée, max 6-7 nodes)
5. **Quel modèle LLM ?** (GPT-4o pour extraction précise, GPT-4o-mini pour volume)

## Étape 2 — Créer le fichier agent

Fichier : `backend/app/agents/<nom_agent>.py`

```python
from __future__ import annotations

import json
import logging
from typing import Any, TypedDict

from langgraph.graph import StateGraph, END
from openai import OpenAI
from sqlalchemy.orm import Session

from app.agents.base import BaseAgent
from app.config import settings

logger = logging.getLogger(__name__)


class <Nom>State(TypedDict):
    db: Any                  # SQLAlchemy Session
    tenant_id: str
    # --- inputs ---
    input_field: str
    # --- outputs ---
    result_field: str
    errors: list[str]


class <Nom>Agent(BaseAgent):
    """Description courte de ce que fait l'agent."""

    def __init__(self, tenant_id: str):
        super().__init__(tenant_id)
        self._client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self._graph = self._build_graph()

    @property
    def agent_name(self) -> str:
        return "<nom_agent>"

    # ── Nodes ─────────────────────────────────────────────────────────────────

    def _node_1(self, state: <Nom>State) -> dict:
        """Description du node."""
        try:
            # logique
            return {"result_field": value}
        except Exception as exc:
            logger.error("_node_1 failed: %s", exc, exc_info=True)
            errors = list(state.get("errors", []))
            errors.append(f"node_1: {exc}")
            return {"errors": errors}

    # ── Graph ──────────────────────────────────────────────────────────────────

    def _build_graph(self):
        g = StateGraph(<Nom>State)
        g.add_node("node_1", self._node_1)
        g.set_entry_point("node_1")
        g.add_edge("node_1", END)
        return g.compile()

    # ── Public API ─────────────────────────────────────────────────────────────

    def run(self, input_data: dict[str, Any], db: Session) -> dict[str, Any]:
        state: <Nom>State = {
            "db": db,
            "tenant_id": self.tenant_id,
            "input_field": input_data["input_field"],
            "result_field": "",
            "errors": [],
        }
        result = self._graph.invoke(state)
        return {
            "result_field": result["result_field"],
            "errors": result.get("errors", []),
        }
```

## Étape 3 — Ajouter un endpoint (si nécessaire)

Nouveau fichier ou ajout dans `backend/app/api/routes/` :

```python
@router.post("/<resource>/{id}", response_model=<Nom>Result)
async def trigger_<nom>(
    id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    from app.agents.<nom_agent> import <Nom>Agent
    agent = <Nom>Agent(tenant_id=str(tenant.id))
    try:
        result = await asyncio.to_thread(agent.run, {"input_field": str(id)}, db)
        return <Nom>Result(**result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
```

Enregistrer dans `main.py` si nouveau fichier de routes.

## Étape 4 — Intégrer dans l'orchestrateur (si nécessaire)

Si l'agent doit être appelé par l'orchestrateur, l'ajouter dans `agents/orchestrator.py` :

```python
def _run_<nom>(self, state: OrchestratorState) -> dict:
    from app.agents.<nom_agent> import <Nom>Agent
    agent = <Nom>Agent(tenant_id=self.tenant_id)
    result = agent.run({"input_field": state["property_id"]}, state["db"])
    return {"<nom>_result": result}
```

## Étape 5 — Checklist avant commit

- [ ] Tous les nodes ont un try/except avec fallback
- [ ] Le modèle LLM est lu depuis `settings.OPENAI_MODEL` ou `settings.OPENAI_MODEL_MINI`
- [ ] Les prompts utilisent `.replace()` pour le contexte dynamique
- [ ] `agent_name` est unique dans le projet
- [ ] L'agent est testé manuellement via Swagger (`/docs`)
- [ ] Les erreurs sont loggées avec `exc_info=True`
