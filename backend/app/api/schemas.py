from __future__ import annotations
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


# ── Auth ──────────────────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
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
    has_cellar: bool = False
    has_garden: bool = False
    energy_class: str | None = None
    ges_class: str | None = None
    annual_energy_cost: float | None = None
    charges_monthly: float | None = None
    lot_count: int | None = None
    syndic_name: str | None = None
    mandate_ref: str | None = None
    mandate_type: str | None = None
    agency_fees_percent: float | None = None
    orientation: str | None = None
    diagnostics: dict | None = None
    photos: list[str] = []
    agent_name: str | None = None
    agent_email: str | None = None


class PropertyRead(PropertyCreate):
    id: UUID
    tenant_id: UUID
    status: str
    status_workflow: str = "draft"
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
    surface: float | None = None
    nb_rooms: int | None = None
    nb_bedrooms: int | None = None
    address: str | None = None
    floor: int | None = None
    status: str | None = None
    status_workflow: str | None = None
    has_balcony: bool | None = None
    has_parking: bool | None = None
    has_elevator: bool | None = None
    has_cellar: bool | None = None
    has_garden: bool | None = None
    energy_class: str | None = None
    ges_class: str | None = None
    annual_energy_cost: float | None = None
    charges_monthly: float | None = None
    lot_count: int | None = None
    syndic_name: str | None = None
    mandate_ref: str | None = None
    mandate_type: str | None = None
    agency_fees_percent: float | None = None
    orientation: str | None = None
    diagnostics: dict | None = None
    photos: list[str] | None = None
    agent_name: str | None = None
    agent_email: str | None = None


class PropertyDraft(BaseModel):
    """Pre-filled property data extracted from a document — used in document-first workflow."""
    type: str | None = None
    title: str | None = None
    description: str | None = None
    price: float | None = None
    surface: float | None = None
    address: str | None = None
    city: str | None = None
    zipcode: str | None = None
    energy_class: str | None = None
    ges_class: str | None = None
    annual_energy_cost: float | None = None
    charges_monthly: float | None = None
    lot_count: int | None = None
    syndic_name: str | None = None
    mandate_ref: str | None = None
    mandate_type: str | None = None
    agency_fees_percent: float | None = None
    diagnostics: dict | None = None
    doc_type: str | None = None       # dpe | copro | mandat | other
    document_id: str | None = None    # ID of the created Document record


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


# ── Settings agence ───────────────────────────────────────────────────────────

class AgencySettings(BaseModel):
    name: str = "ImmoPlus"
    logo_url: str | None = None
    address: str = ""
    phone: str = ""
    email: str = ""
    website_url: str | None = None
    website_crawled_at: str | None = None


class ChatWidgetSettings(BaseModel):
    welcome_message: str = "Bonjour, bienvenue chez ImmoPlus !"
    primary_color: str = "#1d4ed8"
    avatar_url: str | None = None
    auto_open_delay_seconds: int = 3
    placeholder_text: str = "Décrivez votre recherche…"
    position: str = "bottom-right"


class DayHours(BaseModel):
    open: str | None = "09:00"
    close: str | None = "19:00"
    enabled: bool = True


class WorkingHoursSettings(BaseModel):
    monday:    DayHours = DayHours()
    tuesday:   DayHours = DayHours()
    wednesday: DayHours = DayHours()
    thursday:  DayHours = DayHours()
    friday:    DayHours = DayHours(open="09:00", close="18:00")
    saturday:  DayHours = DayHours(open="10:00", close="17:00", enabled=False)
    sunday:    DayHours = DayHours(open=None, close=None, enabled=False)


class CalendarSettings(BaseModel):
    provider: str = "google"
    calendar_id: str = ""
    visit_duration_minutes: int = 60
    min_booking_advance_hours: int = 24
    max_booking_advance_days: int = 30
    agent_email: str = ""


class EmailSettings(BaseModel):
    sender_name: str = "ImmoPlus"
    sender_email: str = ""
    followup_delay_days: int = 7
    send_prospect_confirmation: bool = True
    send_agent_notification: bool = True
    send_visit_confirmation: bool = True


class VoiceSettings(BaseModel):
    provider: str = "vapi"
    vapi_assistant_id: str | None = None
    greeting: str = "Bonjour, vous êtes bien chez ImmoPlus. Comment puis-je vous aider ?"
    out_of_hours_message: str = "Notre agence est fermée. Laissez-nous votre numéro, nous vous rappelons dès demain matin."
    transfer_number: str | None = None
    transfer_on_request: bool = True


class AISettings(BaseModel):
    tone: str = "professionnel"
    language: str = "fr"
    max_properties_shown: int = 3
    escalate_after_turns: int = 10
    match_score_threshold: int = 60   # min score (0-100) for prospect notification
    out_of_scope_response: str = (
        "Je suis spécialisé dans la recherche de biens à la vente. "
        "Pour toute autre demande, contactez-nous directement."
    )


class TenantSettings(BaseModel):
    """Full settings schema for a tenant. Stored as JSON in Tenant.settings."""
    agency: AgencySettings = AgencySettings()
    chat_widget: ChatWidgetSettings = ChatWidgetSettings()
    working_hours: WorkingHoursSettings = WorkingHoursSettings()
    calendar: CalendarSettings = CalendarSettings()
    email: EmailSettings = EmailSettings()
    voice: VoiceSettings = VoiceSettings()
    ai: AISettings = AISettings()

    @classmethod
    def from_db(cls, raw: dict | None) -> "TenantSettings":
        """Parse from DB JSON, filling defaults for any missing keys."""
        return cls(**(raw or {}))


class CrawlStatus(BaseModel):
    status: str          # "started" | "done" | "error"
    pages_crawled: int = 0
    chunks_stored: int = 0
    message: str = ""
