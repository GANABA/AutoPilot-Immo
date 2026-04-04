from __future__ import annotations
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


# ── Auth ──────────────────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: str
    password: str


# ── Property ──────────────────────────────────────────────────────────────────

class PropertyCreate(BaseModel):
    reference: str | None = None
    type: str
    title: str
    description: str | None = None
    price: float
    surface: float
    nb_rooms: int
    nb_bedrooms: int | None = None
    city: str
    zipcode: str
    address: str | None = None
    floor: int | None = None
    has_balcony: bool = False
    has_parking: bool = False
    has_elevator: bool = False
    energy_class: str | None = None
    charges_monthly: float | None = None
    photos: list[str] = []
    agent_name: str | None = None
    agent_email: str | None = None


class PropertyRead(PropertyCreate):
    id: UUID
    tenant_id: UUID
    status: str
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class PropertyList(BaseModel):
    items: list[PropertyRead]
    total: int


class PropertyUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    price: float | None = None
    status: str | None = None
    has_balcony: bool | None = None
    has_parking: bool | None = None
    has_elevator: bool | None = None
    energy_class: str | None = None
    charges_monthly: float | None = None
    photos: list[str] | None = None
    agent_name: str | None = None
    agent_email: str | None = None


# ── Import ────────────────────────────────────────────────────────────────────

class ImportResult(BaseModel):
    imported: int
    skipped: int
    errors: list[str] = []


# ── Chat ──────────────────────────────────────────────────────────────────────

class ConversationCreate(BaseModel):
    prospect_name: str | None = None
    prospect_email: str | None = None


class ConversationRead(BaseModel):
    id: UUID
    tenant_id: UUID
    channel: str
    status: str
    prospect_name: str | None = None
    prospect_email: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageRead(BaseModel):
    id: UUID
    conversation_id: UUID
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Listings ──────────────────────────────────────────────────────────────────

class ListingRead(BaseModel):
    id: UUID
    tenant_id: UUID
    property_id: UUID
    platform: str
    title: str
    content: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ListingUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    status: str | None = None  # draft | approved | published


class GenerateListingsResult(BaseModel):
    listings: list[ListingRead]
    platforms: list[str]


# ── Documents ─────────────────────────────────────────────────────────────────

class DocumentRead(BaseModel):
    id: UUID
    tenant_id: UUID
    property_id: UUID | None = None
    filename: str
    file_url: str
    doc_type: str | None = None
    extracted_data: dict | None = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
