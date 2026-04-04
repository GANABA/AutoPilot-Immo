from __future__ import annotations

import logging
from sqlalchemy.orm import Session
from openai import OpenAI

from app.config import settings
from app.database.models import Property

logger = logging.getLogger(__name__)

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


def generate_embedding(text: str) -> list[float]:
    response = _get_client().embeddings.create(
        input=text,
        model=settings.OPENAI_EMBEDDING_MODEL,
        dimensions=settings.OPENAI_EMBEDDING_DIMENSIONS,
    )
    return response.data[0].embedding


def property_to_text(prop: Property) -> str:
    """Build the text representation of a property used for embedding."""
    features = [
        label
        for flag, label in [
            (prop.has_balcony, "balcon"),
            (prop.has_parking, "parking"),
            (prop.has_elevator, "ascenseur"),
        ]
        if flag
    ]

    parts = [
        f"{prop.type.capitalize()} — {prop.title}",
        f"Localisation : {prop.city} {prop.zipcode}"
        + (f", {prop.address}" if prop.address else ""),
        f"{prop.nb_rooms} pièces"
        + (f", {prop.nb_bedrooms} chambres" if prop.nb_bedrooms else "")
        + f", {prop.surface} m²",
        f"Prix : {prop.price:,.0f} €",
    ]
    if features:
        parts.append("Équipements : " + ", ".join(features))
    if prop.energy_class:
        parts.append(f"Classe énergétique : {prop.energy_class}")
    if prop.charges_monthly:
        parts.append(f"Charges : {prop.charges_monthly:.0f} €/mois")
    if prop.description:
        parts.append(prop.description)

    return "\n".join(parts)


def search_similar_properties(
    db: Session,
    query_embedding: list[float],
    limit: int = 5,
    min_price: float | None = None,
    max_price: float | None = None,
    min_surface: float | None = None,
    min_rooms: int | None = None,
    city: str | None = None,
) -> list[Property]:
    """Return active properties ordered by cosine similarity to query_embedding."""
    query = (
        db.query(Property)
        .filter(Property.embedding.isnot(None))
        .filter(Property.status == "active")
    )
    if min_price is not None:
        query = query.filter(Property.price >= min_price)
    if max_price is not None:
        query = query.filter(Property.price <= max_price)
    if min_surface is not None:
        query = query.filter(Property.surface >= min_surface)
    if min_rooms is not None:
        query = query.filter(Property.nb_rooms >= min_rooms)
    if city is not None:
        query = query.filter(Property.city.ilike(f"%{city}%"))

    return (
        query
        .order_by(Property.embedding.cosine_distance(query_embedding))
        .limit(limit)
        .all()
    )
