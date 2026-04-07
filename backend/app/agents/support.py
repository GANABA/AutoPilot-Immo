from __future__ import annotations

import json
import logging
from typing import Any, TypedDict

from langgraph.graph import StateGraph, END
from openai import OpenAI
from sqlalchemy.orm import Session

from app.agents.base import BaseAgent
from app.config import settings
from app.database.vector_store import (
    generate_embedding,
    property_to_text,
    search_similar_properties,
)

logger = logging.getLogger(__name__)


class SupportState(TypedDict):
    db: Any                     # SQLAlchemy Session (passed through state)
    tenant_id: str
    user_message: str
    history: list[dict]         # [{role, content}] — last N turns
    criteria: dict              # extracted search filters
    properties_context: str     # formatted property list for the LLM
    matched_properties: list    # raw Property objects for card rendering
    response: str               # final assistant response


_CRITERIA_SYSTEM = (
    "Extrais les critères de recherche immobilière du message utilisateur.\n"
    "Réponds UNIQUEMENT avec ce JSON (null si non mentionné) :\n"
    '{"type":"appartement|maison|terrain|null",'
    '"min_price":null,"max_price":null,'
    '"min_surface":null,"min_rooms":null,'
    '"city":"nom de ville ou null"}'
)

_SUPPORT_SYSTEM = """Tu es l'assistant virtuel de l'agence ImmoPlus, spécialisée en immobilier à Lyon et sa région.
Tu aides les prospects à trouver le bien idéal avec professionnalisme et chaleur.

Règles :
- Présente maximum 3 biens par réponse
- Mentionne toujours le prix, la surface et la localisation
- Si aucun bien ne correspond, propose d'élargir les critères
- Tu ne connais que les biens listés ci-dessous
- Réponds toujours en français

Biens disponibles correspondant à la recherche :
{properties_context}"""


class SupportAgent(BaseAgent):
    """RAG chatbot agent for prospect qualification and property search."""

    def __init__(self, tenant_id: str):
        super().__init__(tenant_id)
        self._client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self._graph = self._build_graph()

    @property
    def agent_name(self) -> str:
        return "support"

    # ── LangGraph nodes ───────────────────────────────────────────────────────

    def _extract_criteria(self, state: SupportState) -> dict:
        """Node 1 — extract structured search criteria from the user message."""
        try:
            resp = self._client.chat.completions.create(
                model=settings.OPENAI_MODEL_MINI,
                messages=[
                    {"role": "system", "content": _CRITERIA_SYSTEM},
                    {"role": "user", "content": state["user_message"]},
                ],
                response_format={"type": "json_object"},
                temperature=0,
            )
            criteria = json.loads(resp.choices[0].message.content)
        except Exception as exc:
            logger.warning("Criteria extraction failed: %s", exc)
            criteria = {}
        return {"criteria": criteria}

    def _search_properties(self, state: SupportState) -> dict:
        """Node 2 — vector search with optional structured filters."""
        criteria = state.get("criteria", {})
        db: Session = state["db"]

        # Null-safe filter helpers
        def _f(key: str):
            v = criteria.get(key)
            return None if v in (None, "null") else v

        query_embedding = generate_embedding(state["user_message"])
        props = search_similar_properties(
            db=db,
            query_embedding=query_embedding,
            limit=5,
            min_price=_f("min_price"),
            max_price=_f("max_price"),
            min_surface=_f("min_surface"),
            min_rooms=_f("min_rooms"),
            city=_f("city"),
        )

        context = (
            "\n\n---\n\n".join(property_to_text(p) for p in props)
            if props
            else "Aucun bien ne correspond exactement à cette recherche dans notre catalogue actuel."
        )
        return {"properties_context": context, "matched_properties": props}

    def _generate_response(self, state: SupportState) -> dict:
        """Node 3 — generate the final assistant reply."""
        system = _SUPPORT_SYSTEM.format(
            properties_context=state["properties_context"]
        )
        messages: list[dict] = [{"role": "system", "content": system}]
        messages.extend(state.get("history", []))
        messages.append({"role": "user", "content": state["user_message"]})

        resp = self._client.chat.completions.create(
            model=settings.OPENAI_MODEL_MINI,
            messages=messages,
            temperature=0.7,
            max_tokens=800,
        )
        return {"response": resp.choices[0].message.content}

    def _build_graph(self):
        g = StateGraph(SupportState)
        g.add_node("extract_criteria", self._extract_criteria)
        g.add_node("search_properties", self._search_properties)
        g.add_node("generate_response", self._generate_response)
        g.set_entry_point("extract_criteria")
        g.add_edge("extract_criteria", "search_properties")
        g.add_edge("search_properties", "generate_response")
        g.add_edge("generate_response", END)
        return g.compile()

    # ── Public API ─────────────────────────────────────────────────────────────

    def run(self, input_data: dict[str, Any], db: Session) -> dict[str, Any]:
        """Run the full support pipeline and return the agent response."""
        state: SupportState = {
            "db": db,
            "tenant_id": self.tenant_id,
            "user_message": input_data["message"],
            "history": input_data.get("history", []),
            "criteria": {},
            "properties_context": "",
            "matched_properties": [],
            "response": "",
        }
        result = self._graph.invoke(state)

        # Serialize matched properties for WebSocket transmission
        _IMAGES = {
            "appartement": [
                "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400&q=80",
                "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=400&q=80",
                "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400&q=80",
                "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=400&q=80",
            ],
            "maison": [
                "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&q=80",
                "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&q=80",
                "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80",
            ],
        }
        _DEFAULT_IMG = "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400&q=80"

        def _img(prop, idx):
            imgs = _IMAGES.get(getattr(prop, "type", ""), [_DEFAULT_IMG])
            return imgs[idx % len(imgs)]

        cards = [
            {
                "id": str(p.id),
                "title": p.title,
                "price": p.price,
                "surface": p.surface,
                "nb_rooms": p.nb_rooms,
                "city": p.city,
                "zipcode": p.zipcode or "",
                "type": getattr(p, "type", "bien"),
                "image": _img(p, i),
                "has_parking": getattr(p, "has_parking", False),
                "has_balcony": getattr(p, "has_balcony", False),
                "energy_class": getattr(p, "energy_class", None),
            }
            for i, p in enumerate(result.get("matched_properties", []))
        ]

        return {
            "response": result["response"],
            "properties_context": result["properties_context"],
            "criteria": result["criteria"],
            "property_cards": cards,
        }
