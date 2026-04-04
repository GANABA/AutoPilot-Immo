from __future__ import annotations

import logging
from typing import Any, TypedDict
from uuid import UUID

from langgraph.graph import StateGraph, END
from openai import OpenAI
from sqlalchemy.orm import Session

from app.agents.base import BaseAgent
from app.config import settings
from app.database.models import Listing, Property

logger = logging.getLogger(__name__)

# Platform-specific constraints for each listing type
PLATFORM_CONFIGS: list[dict] = [
    {
        "platform": "leboncoin",
        "label": "Leboncoin",
        "max_chars": 3000,
        "tone": "direct et accessible, style particulier à particulier",
        "instructions": (
            "- Commence par le type et la localisation\n"
            "- Met en avant le prix en premier\n"
            "- Utilise des phrases courtes\n"
            "- Mentionne les équipements clés (parking, balcon, ascenseur)\n"
            "- Termine par les coordonnées de contact : 'Contact : ImmoPlus - contact@immoplus.fr'"
        ),
    },
    {
        "platform": "seloger",
        "label": "SeLoger",
        "max_chars": 3000,
        "tone": "professionnel et détaillé, style agence immobilière",
        "instructions": (
            "- Commence par une accroche valorisante\n"
            "- Décris l'emplacement et le quartier\n"
            "- Détaille chaque pièce de manière attractive\n"
            "- Mentionne la classe énergie si connue\n"
            "- Conclure par l'invitation à visiter : 'Contactez ImmoPlus pour organiser une visite'"
        ),
    },
    {
        "platform": "website",
        "label": "Site web ImmoPlus",
        "max_chars": 5000,
        "tone": "chaleureux et informatif, avec des sous-titres",
        "instructions": (
            "- Commence par une accroche poétique sur le bien\n"
            "- Utilise des sous-titres : ## Le bien, ## L'emplacement, ## Prestations\n"
            "- Développe chaque aspect du bien en détail\n"
            "- Pense SEO : utilise des mots-clés naturels\n"
            "- Termine par un appel à l'action fort"
        ),
    },
]

_WRITER_SYSTEM = """Tu es un expert en rédaction d'annonces immobilières pour l'agence ImmoPlus à Lyon.
Rédige une annonce pour la plateforme {label} avec le ton suivant : {tone}.

Instructions spécifiques :
{instructions}

Contrainte : maximum {max_chars} caractères.

Données du bien :
{property_context}

Génère UNIQUEMENT le texte de l'annonce, sans titre séparé (il sera ajouté automatiquement)."""

_TITLE_SYSTEM = """Génère un titre d'annonce immobilière accrocheur pour la plateforme {label}.
Maximum 80 caractères. Pas de guillemets.

Bien : {property_summary}"""


class WriterState(TypedDict):
    db: Any
    tenant_id: str
    property_id: str
    property: Any           # Property ORM object
    drafts: list[dict]      # [{platform, title, content}]
    saved_ids: list[str]    # UUIDs of saved Listing rows


class WriterAgent(BaseAgent):
    """Generates platform-specific real estate listings using LangGraph."""

    def __init__(self, tenant_id: str):
        super().__init__(tenant_id)
        self._client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self._graph = self._build_graph()

    @property
    def agent_name(self) -> str:
        return "writer"

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _property_context(self, prop: Property) -> str:
        lines = [
            f"Type : {prop.type}",
            f"Titre actuel : {prop.title}",
            f"Prix : {prop.price:,.0f} €",
            f"Surface : {prop.surface} m²",
            f"Pièces : {prop.nb_rooms}" + (f" ({prop.nb_bedrooms} chambres)" if prop.nb_bedrooms else ""),
            f"Localisation : {prop.city} {prop.zipcode}" + (f", {prop.address}" if prop.address else ""),
        ]
        if prop.floor is not None:
            lines.append(f"Étage : {prop.floor}")
        features = []
        if prop.has_balcony:
            features.append("balcon")
        if prop.has_parking:
            features.append("parking")
        if prop.has_elevator:
            features.append("ascenseur")
        if features:
            lines.append("Équipements : " + ", ".join(features))
        if prop.energy_class:
            lines.append(f"Classe énergie : {prop.energy_class}")
        if prop.charges_monthly:
            lines.append(f"Charges : {prop.charges_monthly:.0f} €/mois")
        if prop.description:
            lines.append(f"\nDescription existante :\n{prop.description}")
        return "\n".join(lines)

    # ── LangGraph nodes ───────────────────────────────────────────────────────

    def _load_property(self, state: WriterState) -> dict:
        db: Session = state["db"]
        prop = db.query(Property).filter_by(id=state["property_id"]).first()
        if not prop:
            raise ValueError(f"Property {state['property_id']} not found")
        return {"property": prop}

    def _generate_drafts(self, state: WriterState) -> dict:
        prop: Property = state["property"]
        context = self._property_context(prop)
        summary = f"{prop.type} {prop.nb_rooms} pièces {prop.surface}m² à {prop.city} — {prop.price:,.0f}€"
        drafts: list[dict] = []

        for cfg in PLATFORM_CONFIGS:
            # Generate title
            title_resp = self._client.chat.completions.create(
                model=settings.OPENAI_MODEL_MINI,
                messages=[
                    {
                        "role": "user",
                        "content": _TITLE_SYSTEM.format(
                            label=cfg["label"],
                            property_summary=summary,
                        ),
                    }
                ],
                temperature=0.8,
                max_tokens=60,
            )
            title = title_resp.choices[0].message.content.strip()

            # Generate body
            body_resp = self._client.chat.completions.create(
                model=settings.OPENAI_MODEL_MINI,
                messages=[
                    {
                        "role": "user",
                        "content": _WRITER_SYSTEM.format(
                            label=cfg["label"],
                            tone=cfg["tone"],
                            instructions=cfg["instructions"],
                            max_chars=cfg["max_chars"],
                            property_context=context,
                        ),
                    }
                ],
                temperature=0.75,
                max_tokens=1000,
            )
            content = body_resp.choices[0].message.content.strip()

            drafts.append({
                "platform": cfg["platform"],
                "title": title,
                "content": content,
            })
            logger.info("Generated draft for %s — %s", cfg["platform"], title)

        return {"drafts": drafts}

    def _save_drafts(self, state: WriterState) -> dict:
        db: Session = state["db"]
        prop: Property = state["property"]
        saved_ids: list[str] = []

        for draft in state["drafts"]:
            # Overwrite any existing draft for the same property+platform
            existing = (
                db.query(Listing)
                .filter_by(property_id=prop.id, platform=draft["platform"])
                .first()
            )
            if existing:
                existing.title = draft["title"]
                existing.content = draft["content"]
                existing.status = "draft"
                saved_ids.append(str(existing.id))
            else:
                listing = Listing(
                    tenant_id=prop.tenant_id,
                    property_id=prop.id,
                    platform=draft["platform"],
                    title=draft["title"],
                    content=draft["content"],
                    status="draft",
                )
                db.add(listing)
                db.flush()
                saved_ids.append(str(listing.id))

        db.commit()
        return {"saved_ids": saved_ids}

    def _build_graph(self):
        g = StateGraph(WriterState)
        g.add_node("load_property", self._load_property)
        g.add_node("generate_drafts", self._generate_drafts)
        g.add_node("save_drafts", self._save_drafts)
        g.set_entry_point("load_property")
        g.add_edge("load_property", "generate_drafts")
        g.add_edge("generate_drafts", "save_drafts")
        g.add_edge("save_drafts", END)
        return g.compile()

    # ── Public API ─────────────────────────────────────────────────────────────

    def run(self, input_data: dict[str, Any], db: Session) -> dict[str, Any]:
        state: WriterState = {
            "db": db,
            "tenant_id": self.tenant_id,
            "property_id": input_data["property_id"],
            "property": None,
            "drafts": [],
            "saved_ids": [],
        }
        result = self._graph.invoke(state)
        return {
            "drafts": result["drafts"],
            "saved_ids": result["saved_ids"],
            "platforms": [d["platform"] for d in result["drafts"]],
        }
