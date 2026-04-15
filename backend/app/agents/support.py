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
    search_knowledge_chunks,
)

logger = logging.getLogger(__name__)


class SupportState(TypedDict):
    db: Any                     # SQLAlchemy Session (passed through state)
    tenant_id: str
    tenant_settings: dict       # raw tenant.settings dict (read-only)
    user_message: str
    history: list[dict]         # [{role, content}] — last N turns
    criteria: dict              # extracted search filters
    properties_context: str     # formatted property list for the LLM
    knowledge_context: str      # website/FAQ chunks for agency questions
    matched_properties: list    # raw Property objects for card rendering
    response: str               # final assistant response
    detected_email: str         # email address detected in user message (or "")
    detected_name: str          # name detected in user message (or "")
    available_slots: list       # calendar slots offered to prospect
    booked_slot: dict           # confirmed slot {"label":..., "datetime":...} or {}
    booking_intent: bool        # True if user expressed intent to visit
    contact_captured: bool      # True if prospect email is already known


_BOOKING_SYSTEM = (
    "Analyse ce message dans le contexte d'une conversation immobilière.\n"
    "Réponds UNIQUEMENT avec ce JSON :\n"
    '{"booking_intent": true/false, '
    '"slot_confirmation": "texte du créneau choisi ou null"}\n'
    "booking_intent=true si l'utilisateur veut organiser/planifier/réserver une visite.\n"
    "slot_confirmation=le créneau confirmé si l'utilisateur accepte un des créneaux proposés (ex: 'jeudi 10h', 'oui pour vendredi', 'le 17 à 14h')."
)

_CRITERIA_SYSTEM = (
    "Extrais les critères de recherche immobilière du message utilisateur.\n"
    "Réponds UNIQUEMENT avec ce JSON (null si non mentionné) :\n"
    '{"type":"appartement|maison|terrain|null",'
    '"min_price":null,"max_price":null,'
    '"min_surface":null,"min_rooms":null,'
    '"city":"nom de ville ou null"}'
)

_SUPPORT_SYSTEM = """Tu es l'assistant virtuel de {agency_name}, spécialisée en immobilier.
Tu aides les prospects à trouver le bien idéal avec {tone}.

Règles :
- Présente maximum {max_properties} biens par réponse
- Mentionne toujours le prix, la surface et la localisation
- Si aucun bien ne correspond, propose d'élargir les critères
- Réponds toujours en {language}
- Si le prospect veut visiter et que des créneaux sont disponibles, présente-les clairement
- Si une visite vient d'être confirmée, confirme-la chaleureusement et rappelle les détails
- Pour les questions hors sujet (non immobilières, non liées à l'agence) : {out_of_scope_response}

Biens disponibles correspondant à la recherche :
{properties_context}

{knowledge_context}

{slots_context}

{contact_context}"""


def _match_slot(text: str, slots: list[dict]) -> dict | None:
    """Find the slot that best matches a free-text confirmation like 'jeudi 10h'."""
    text_lower = text.lower()
    for slot in slots:
        label = slot["label"].lower()
        # Match on any word from the label appearing in the confirmation text
        words = [w for w in label.split() if len(w) > 2]
        if sum(1 for w in words if w in text_lower) >= 2:
            return slot
    # Fallback: return first slot if user said "oui" / "ok" / "parfait"
    if any(k in text_lower for k in ("oui", "ok", "parfait", "ça me convient", "d'accord")):
        return slots[0] if slots else None
    return None


def _first_property_title(state: SupportState) -> str:
    props = state.get("matched_properties") or []
    if props:
        return getattr(props[0], "title", "Bien ImmoPlus")
    return "Bien ImmoPlus"


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
        """Node 2 — vector search (properties + knowledge chunks)."""
        criteria = state.get("criteria", {})
        db: Session = state["db"]
        ts = state.get("tenant_settings") or {}
        max_props = ts.get("ai", {}).get("max_properties_shown", 3)

        # Null-safe filter helpers
        def _f(key: str):
            v = criteria.get(key)
            return None if v in (None, "null") else v

        query_embedding = generate_embedding(state["user_message"])

        props = search_similar_properties(
            db=db,
            query_embedding=query_embedding,
            limit=max_props + 2,  # fetch a few extra, cap in response
            min_price=_f("min_price"),
            max_price=_f("max_price"),
            min_surface=_f("min_surface"),
            min_rooms=_f("min_rooms"),
            city=_f("city"),
        )

        properties_context = (
            "\n\n---\n\n".join(property_to_text(p) for p in props)
            if props
            else "Aucun bien ne correspond exactement à cette recherche dans notre catalogue actuel."
        )

        # Search agency knowledge base (website chunks)
        knowledge_context = ""
        try:
            chunks = search_knowledge_chunks(
                db=db,
                query_embedding=query_embedding,
                tenant_id=state["tenant_id"],
                limit=3,
            )
            if chunks:
                knowledge_context = (
                    "Informations sur l'agence (site web) :\n"
                    + "\n\n".join(
                        f"[{c.title}]\n{c.content}" for c in chunks
                    )
                )
        except Exception as exc:
            logger.warning("Knowledge chunk search failed: %s", exc)

        return {
            "properties_context": properties_context,
            "matched_properties": props[:max_props],
            "knowledge_context": knowledge_context,
        }

    def _detect_contact(self, state: SupportState) -> dict:
        """Node 3 — detect email/name in the user message via regex."""
        import re
        msg = state["user_message"]
        email_match = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", msg)
        detected_email = email_match.group(0).lower() if email_match else ""

        # Simple name detection: "je m'appelle X" / "c'est X" / "mon nom est X"
        name_match = re.search(
            r"(?:je m'appelle|mon nom est|c'est|je suis)\s+([A-ZÀÂÉÈÊË][a-zàâéèêëïîôùûü]+(?:\s+[A-ZÀÂÉÈÊË][a-zàâéèêëïîôùûü]+)?)",
            msg,
            re.IGNORECASE,
        )
        detected_name = name_match.group(1).strip() if name_match else ""
        return {"detected_email": detected_email, "detected_name": detected_name}

    def _handle_booking(self, state: SupportState) -> dict:
        """Node 4 — detect booking intent, fetch slots, or confirm a visit."""
        _safe_return = {"booking_intent": False, "available_slots": state.get("available_slots") or [], "booked_slot": {}}
        try:
            return self._handle_booking_inner(state)
        except Exception as exc:
            logger.error("_handle_booking crashed (non-fatal): %s", exc, exc_info=True)
            return _safe_return

    def _handle_booking_inner(self, state: SupportState) -> dict:
        from app.services.calendar_service import get_available_slots, create_visit_event

        # Detect booking intent / slot confirmation via LLM
        try:
            resp = self._client.chat.completions.create(
                model=settings.OPENAI_MODEL_MINI,
                messages=[
                    {"role": "system", "content": _BOOKING_SYSTEM},
                    {"role": "user", "content": state["user_message"]},
                ],
                response_format={"type": "json_object"},
                temperature=0,
            )
            booking_data = json.loads(resp.choices[0].message.content)
        except Exception as exc:
            logger.warning("Booking detection failed: %s", exc)
            booking_data = {}

        booking_intent = bool(booking_data.get("booking_intent"))
        slot_confirmation = booking_data.get("slot_confirmation")

        available_slots = list(state.get("available_slots") or [])
        booked_slot: dict = {}

        # Case 1: user confirms a slot → create the calendar event
        if slot_confirmation and available_slots:
            matched = _match_slot(slot_confirmation, available_slots)
            if matched:
                try:
                    event_id = create_visit_event(
                        slot_datetime=matched["datetime"],
                        prospect_name=state.get("detected_name") or "Prospect",
                        prospect_email=state.get("detected_email") or "",
                        property_title=_first_property_title(state),
                        agent_email="contact@immoplus.fr",
                    )
                except Exception as exc:
                    logger.error("create_visit_event failed: %s", exc, exc_info=True)
                    event_id = None
                booked_slot = {**matched, "event_id": event_id or ""}
                logger.info("Booking confirmed: %s → event %s", matched["label"], event_id)

        # Case 2: booking intent with no prior slots → fetch available slots
        elif booking_intent and not available_slots:
            try:
                available_slots = get_available_slots()
                logger.info("Booking intent detected — fetched %d slots", len(available_slots))
            except Exception as exc:
                logger.error("get_available_slots failed: %s", exc, exc_info=True)

        return {
            "booking_intent": booking_intent,
            "available_slots": available_slots,
            "booked_slot": booked_slot,
        }

    def _generate_response(self, state: SupportState) -> dict:
        """Node 5 — generate the final assistant reply."""
        # Build calendar context for the LLM
        slots_context = ""
        if state.get("booked_slot"):
            s = state["booked_slot"]
            event_id = s.get("event_id", "")
            calendar_note = "L'événement a été ajouté au calendrier Google." if (event_id and not event_id.startswith("mock-")) else "La demande de visite a bien été enregistrée."
            slots_context = f"VISITE CONFIRMÉE : {s['label']}. {calendar_note}"
        elif state.get("available_slots"):
            labels = "\n".join(f"- {s['display']}" for s in state["available_slots"][:5])
            slots_context = f"Créneaux disponibles pour une visite :\n{labels}"

        # Build contact collection nudge
        contact_context = ""
        if not state.get("contact_captured"):
            props_found = bool(state.get("matched_properties"))
            booking = state.get("booking_intent", False)
            history_len = len(state.get("history", []))
            if (props_found or booking) and history_len < 8:
                contact_context = (
                    "IMPORTANT — Collecte contact : Vous ne connaissez pas encore les coordonnées du prospect. "
                    "À la fin de cette réponse, demandez-lui en une phrase chaleureuse son prénom et son adresse email "
                    "pour lui envoyer ces résultats et le tenir informé des nouveaux biens correspondants. "
                    "Exemple : « Pour vous envoyer ces résultats et vous alerter des nouvelles opportunités, "
                    "pourriez-vous me laisser votre prénom et votre email ? »"
                )
        else:
            contact_context = "Note : coordonnées prospect déjà enregistrées — ne redemandez pas ses informations."

        # Read tenant settings (with defaults)
        ts = state.get("tenant_settings") or {}
        ai_cfg = ts.get("ai", {})
        agency_cfg = ts.get("agency", {})

        # Build agency contact string for out-of-scope replies
        agency_contact_parts = []
        if agency_cfg.get("phone"):
            agency_contact_parts.append(f"tél. {agency_cfg['phone']}")
        if agency_cfg.get("email"):
            agency_contact_parts.append(f"email {agency_cfg['email']}")
        agency_contact = " / ".join(agency_contact_parts) if agency_contact_parts else ""

        out_of_scope = ai_cfg.get(
            "out_of_scope_response",
            "Je suis spécialisé dans la recherche immobilière. Pour toute autre demande, contactez-nous directement.",
        )
        if agency_contact:
            out_of_scope = out_of_scope.rstrip(".") + f" ({agency_contact})."

        system = (
            _SUPPORT_SYSTEM
            .replace("{agency_name}", agency_cfg.get("name", "ImmoPlus"))
            .replace("{tone}", ai_cfg.get("tone", "professionnalisme et chaleur"))
            .replace("{max_properties}", str(ai_cfg.get("max_properties_shown", 3)))
            .replace("{language}", ai_cfg.get("language", "français"))
            .replace("{out_of_scope_response}", out_of_scope)
            .replace("{properties_context}", state["properties_context"])
            .replace("{knowledge_context}", state.get("knowledge_context", ""))
            .replace("{slots_context}", slots_context)
            .replace("{contact_context}", contact_context)
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
        g.add_node("detect_contact", self._detect_contact)
        g.add_node("handle_booking", self._handle_booking)
        g.add_node("generate_response", self._generate_response)
        g.set_entry_point("extract_criteria")
        g.add_edge("extract_criteria", "search_properties")
        g.add_edge("search_properties", "detect_contact")
        g.add_edge("detect_contact", "handle_booking")
        g.add_edge("handle_booking", "generate_response")
        g.add_edge("generate_response", END)
        return g.compile()

    # ── Public API ─────────────────────────────────────────────────────────────

    def run(self, input_data: dict[str, Any], db: Session) -> dict[str, Any]:
        """Run the full support pipeline and return the agent response."""
        state: SupportState = {
            "db": db,
            "tenant_id": self.tenant_id,
            "tenant_settings": input_data.get("tenant_settings", {}),
            "user_message": input_data["message"],
            "history": input_data.get("history", []),
            "criteria": {},
            "properties_context": "",
            "knowledge_context": "",
            "matched_properties": [],
            "response": "",
            "detected_email": "",
            "detected_name": "",
            "available_slots": input_data.get("available_slots", []),
            "booked_slot": {},
            "booking_intent": False,
            "contact_captured": input_data.get("contact_captured", False),
        }
        result = self._graph.invoke(state)

        # Serialize matched properties for WebSocket transmission
        _FALLBACK_IMAGES = {
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
            # Use real photos if available, fall back to Unsplash
            photos = getattr(prop, "photos", None) or []
            if photos:
                return photos[0]
            imgs = _FALLBACK_IMAGES.get(getattr(prop, "type", ""), [_DEFAULT_IMG])
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
            "detected_email": result.get("detected_email", ""),
            "detected_name": result.get("detected_name", ""),
            "available_slots": result.get("available_slots", []),
            "booked_slot": result.get("booked_slot", {}),
        }
