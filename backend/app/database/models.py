import uuid

from __future__ import annotations

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey,
    Integer, String, Text, JSON, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

from app.config import settings
from app.database.connection import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False)
    website_url = Column(String, nullable=True)
    email = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    settings = Column(JSON, default=dict)
    created_at = Column(DateTime, server_default=func.now())

    users = relationship("User", back_populates="tenant")
    properties = relationship("Property", back_populates="tenant")
    conversations = relationship("Conversation", back_populates="tenant")


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    tenant = relationship("Tenant", back_populates="users")


class Property(Base):
    __tablename__ = "properties"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    reference = Column(String, nullable=True)
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    price = Column(Float, nullable=False)
    surface = Column(Float, nullable=False)
    nb_rooms = Column(Integer, nullable=False)
    nb_bedrooms = Column(Integer, nullable=True)
    city = Column(String, nullable=False)
    zipcode = Column(String, nullable=False)
    address = Column(String, nullable=True)
    floor = Column(Integer, nullable=True)
    has_balcony = Column(Boolean, default=False)
    has_parking = Column(Boolean, default=False)
    has_elevator = Column(Boolean, default=False)
    energy_class = Column(String, nullable=True)
    charges_monthly = Column(Float, nullable=True)
    photos = Column(JSON, default=list)
    status = Column(String, default="active")
    status_workflow = Column(String, default="draft")  # draft → review → active → sold / rented
    agent_name = Column(String, nullable=True)
    agent_email = Column(String, nullable=True)
    # Mandat fields
    mandate_ref = Column(String, nullable=True)
    mandate_type = Column(String, nullable=True)       # vente | location
    agency_fees_percent = Column(Float, nullable=True)
    # Energy / GES
    ges_class = Column(String, nullable=True)
    annual_energy_cost = Column(Float, nullable=True)
    # Amenities
    has_cellar = Column(Boolean, default=False)
    has_garden = Column(Boolean, default=False)
    orientation = Column(String, nullable=True)
    # Copro
    lot_count = Column(Integer, nullable=True)
    syndic_name = Column(String, nullable=True)
    # Diagnostics (JSON: lead_paint, asbestos, electrical, gas)
    diagnostics = Column(JSON, nullable=True)
    extra = Column("metadata", JSON, default=dict)
    embedding = Column(Vector(settings.OPENAI_EMBEDDING_DIMENSIONS), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    tenant = relationship("Tenant", back_populates="properties")
    documents = relationship("Document", back_populates="property")
    listings = relationship("Listing", back_populates="property")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    channel = Column(String, nullable=False)  # web_chat, email, phone, api
    prospect_name = Column(String, nullable=True)
    prospect_email = Column(String, nullable=True)
    prospect_phone = Column(String, nullable=True)
    search_criteria = Column(JSON, nullable=True)
    status = Column(String, default="open")  # open, qualified, visit_booked, closed
    notes = Column(Text, nullable=True)
    call_summary = Column(Text, nullable=True)   # GPT summary for voice calls
    call_duration_sec = Column(Integer, nullable=True)
    visit_property_id = Column(UUID(as_uuid=True), ForeignKey("properties.id"), nullable=True)
    visit_booked_at = Column(DateTime(timezone=True), nullable=True)
    voice_call_id = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    tenant = relationship("Tenant", back_populates="conversations")
    visited_property = relationship("Property", foreign_keys=[visit_property_id])
    messages = relationship(
        "Message", back_populates="conversation", cascade="all, delete-orphan"
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(
        UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False
    )
    role = Column(String, nullable=False)  # user, assistant, system
    content = Column(Text, nullable=False)
    extra = Column("metadata", JSON, default=dict)
    created_at = Column(DateTime, server_default=func.now())

    conversation = relationship("Conversation", back_populates="messages")


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    property_id = Column(
        UUID(as_uuid=True), ForeignKey("properties.id"), nullable=True
    )
    filename = Column(String, nullable=False)
    file_url = Column(String, nullable=False)
    doc_type = Column(String, nullable=True)  # dpe, copro, mandat, other
    extracted_data = Column(JSON, nullable=True)
    status = Column(String, default="pending")  # pending, processing, done, error
    created_at = Column(DateTime, server_default=func.now())

    property = relationship("Property", back_populates="documents")


class Listing(Base):
    __tablename__ = "listings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    property_id = Column(
        UUID(as_uuid=True), ForeignKey("properties.id"), nullable=False
    )
    platform = Column(String, nullable=False)  # leboncoin, seloger, website
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    status = Column(String, default="draft")  # draft, approved, published
    created_at = Column(DateTime, server_default=func.now())

    property = relationship("Property", back_populates="listings")


class KnowledgeChunk(Base):
    """
    Text chunks from external sources (agency website, FAQs…) indexed in pgvector.
    Used by the SupportAgent to answer questions beyond the property catalogue.
    """
    __tablename__ = "knowledge_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    source_type = Column(String, nullable=False)   # "website" | "faq" | "document"
    source_id = Column(String, nullable=True)       # URL, document_id, etc.
    title = Column(String, nullable=True)           # page title or section heading
    content = Column(Text, nullable=False)          # chunk text used for embedding
    embedding = Column(Vector(settings.OPENAI_EMBEDDING_DIMENSIONS), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class Notification(Base):
    """Dashboard notifications (new prospect, new call, escalation, etc.)."""
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    type = Column(String, nullable=False)   # new_prospect, new_call, visit_booked, escalation
    title = Column(String, nullable=False)
    body = Column(Text, nullable=True)
    data = Column(JSON, nullable=True)      # e.g. {"conversation_id": "..."}
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())


class WorkflowRun(Base):
    """
    Tracks one full execution of a multi-step workflow (e.g. new_property).
    Each step is recorded in `steps` JSON as the workflow progresses.
    """
    __tablename__ = "workflow_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    workflow = Column(String, nullable=False)           # new_property, etc.
    entity_id = Column(String, nullable=True)           # e.g. property_id
    status = Column(String, default="running")          # running, done, done_with_errors, error
    steps = Column(JSON, default=list)                  # [{name, status, detail, ts}]
    summary = Column(JSON, nullable=True)               # final summary dict
    started_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)


class AgentTask(Base):
    """Execution log for every agent action."""
    __tablename__ = "agent_tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    agent = Column(String, nullable=False)   # support, analyst, writer, voice, orchestrator
    action = Column(String, nullable=False)  # analyze_document, generate_listing, …
    input_data = Column(JSON, nullable=False)
    output_data = Column(JSON, nullable=True)
    status = Column(String, default="pending")  # pending, running, done, error
    error_message = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)
