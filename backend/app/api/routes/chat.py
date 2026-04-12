from __future__ import annotations

import asyncio
import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.api.schemas import ConversationCreate, ConversationRead, MessageRead
from app.database.connection import SessionLocal
from app.database.models import Conversation, Message, Tenant

logger = logging.getLogger(__name__)
router = APIRouter()


def _send_visit_confirmation_email(
    prospect_name: str,
    prospect_email: str,
    slot_label: str,
    property_title: str,
) -> None:
    from app.services.email_service import send_visit_confirmation
    send_visit_confirmation(prospect_name, prospect_email, slot_label, property_title)


def _send_qualification_emails(
    prospect_name: str,
    prospect_email: str,
    property_cards: list[dict],
    conversation_id: str,
    tenant,
) -> None:
    """
    Fire both qualification emails in one call (runs in thread pool).
    - Confirmation to the prospect with matching properties
    - Notification to the agent with prospect details
    Only sent once per email address (caller ensures conv.prospect_email was just set).
    """
    from app.services.email_service import send_prospect_confirmation, send_agent_new_prospect

    send_prospect_confirmation(prospect_name, prospect_email, property_cards)

    agent_email = (tenant.email if tenant else None) or "contact@immoplus.fr"
    send_agent_new_prospect(
        agent_email=agent_email,
        prospect_name=prospect_name,
        prospect_email=prospect_email,
        properties=property_cards,
        conversation_id=conversation_id,
    )


# ── REST endpoints ────────────────────────────────────────────────────────────

@router.get("/conversations", response_model=list[ConversationRead])
def list_conversations(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List all conversations (dashboard use)."""
    tenant = db.query(Tenant).filter_by(slug="immoplus").first()
    if not tenant:
        return []
    return (
        db.query(Conversation)
        .filter_by(tenant_id=tenant.id)
        .order_by(Conversation.created_at.desc())
        .limit(50)
        .all()
    )


@router.post("/conversations", response_model=ConversationRead)
def start_conversation(
    body: ConversationCreate = ConversationCreate(),
    db: Session = Depends(get_db),
):
    """Create a new chat conversation and return its ID."""
    tenant = db.query(Tenant).filter_by(slug="immoplus").first()
    if not tenant:
        raise HTTPException(status_code=500, detail="Tenant not configured.")

    conv = Conversation(
        tenant_id=tenant.id,
        channel="web_chat",
        prospect_name=body.prospect_name,
        prospect_email=body.prospect_email,
        status="open",
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageRead])
def get_messages(conversation_id: UUID, db: Session = Depends(get_db)):
    """Return all messages for a given conversation."""
    conv = db.query(Conversation).filter_by(id=conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return (
        db.query(Message)
        .filter_by(conversation_id=conversation_id)
        .order_by(Message.created_at.asc())
        .all()
    )


# ── WebSocket ─────────────────────────────────────────────────────────────────

@router.websocket("/ws/{conversation_id}")
async def chat_websocket(websocket: WebSocket, conversation_id: UUID):
    """
    Real-time chat via WebSocket.

    Client sends:  {"content": "Je cherche un T3 à Lyon..."}
    Server sends:  {"type": "assistant"|"typing"|"error", "content": "..."}
    """
    await websocket.accept()

    db: Session = SessionLocal()
    try:
        conv = db.query(Conversation).filter_by(id=conversation_id).first()
        if not conv:
            await websocket.send_json({"type": "error", "content": "Conversation introuvable."})
            await websocket.close(code=4004)
            return

        tenant = db.query(Tenant).filter_by(id=conv.tenant_id).first()

        # Lazy import to avoid circular deps and heavy init at startup
        from app.agents.support import SupportAgent
        agent = SupportAgent(tenant_id=str(conv.tenant_id))

        # In-memory slots state for multi-turn booking flow (per WebSocket connection)
        session_slots: list = []

        # Welcome message from tenant settings
        welcome = (tenant.settings or {}).get(
            "default_greeting", "Bonjour ! Je suis l'assistant ImmoPlus. Comment puis-je vous aider ?"
        )
        await websocket.send_json({"type": "assistant", "content": welcome})

        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue

            user_message = (payload.get("content") or "").strip()
            if not user_message:
                continue

            # Persist user message
            db.add(Message(
                conversation_id=conversation_id,
                role="user",
                content=user_message,
            ))
            db.commit()

            # Build recent history (exclude the message we just added)
            history_rows = (
                db.query(Message)
                .filter_by(conversation_id=conversation_id)
                .order_by(Message.created_at.asc())
                .limit(20)
                .all()
            )
            history = [
                {"role": m.role, "content": m.content}
                for m in history_rows[:-1]  # everything before the current message
            ]

            # Typing indicator
            await websocket.send_json({"type": "typing"})

            # Pass previously offered slots (in-memory, same WebSocket session)
            prior_slots = session_slots

            # Run blocking agent in thread pool
            result = {}
            try:
                result = await asyncio.to_thread(
                    agent.run,
                    {"message": user_message, "history": history, "available_slots": prior_slots},
                    db,
                )
            except Exception as exc:
                logger.error("SupportAgent error: %s", exc, exc_info=True)

            response_text = result.get("response") or "Désolé, une erreur s'est produite. Veuillez réessayer."
            property_cards = result.get("property_cards", [])
            detected_email = result.get("detected_email", "")
            detected_name = result.get("detected_name", "")
            available_slots = result.get("available_slots", [])
            booked_slot = result.get("booked_slot", {})

            # Persist search criteria on conversation for orchestrator matching
            if result.get("criteria"):
                conv.search_criteria = result["criteria"]
                db.commit()

            # Update conversation with contact info if newly detected
            if detected_email and not conv.prospect_email:
                conv.prospect_email = detected_email
                if detected_name and not conv.prospect_name:
                    conv.prospect_name = detected_name
                db.commit()
                logger.info("Prospect contact captured: %s <%s>", detected_name, detected_email)

            # Keep slots in memory for next turn in this session
            if available_slots:
                session_slots = available_slots

            # Persist assistant reply
            db.add(Message(
                conversation_id=conversation_id,
                role="assistant",
                content=response_text,
            ))
            db.commit()

            # Email: visit confirmation
            if booked_slot and conv.prospect_email:
                await asyncio.to_thread(
                    _send_visit_confirmation_email,
                    conv.prospect_name or "",
                    conv.prospect_email,
                    booked_slot.get("label", ""),
                    property_cards[0]["title"] if property_cards else "Bien ImmoPlus",
                )

            # Email: qualification (properties found + email known)
            elif property_cards and conv.prospect_email and not prior_slots:
                await asyncio.to_thread(
                    _send_qualification_emails,
                    conv.prospect_name or "",
                    conv.prospect_email,
                    property_cards,
                    str(conversation_id),
                    tenant,
                )

            # Send property cards before text (only when properties were found)
            if property_cards:
                await websocket.send_json({"type": "properties", "items": property_cards})

            await websocket.send_json({"type": "assistant", "content": response_text})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: %s", conversation_id)
    except Exception as exc:
        logger.error("WebSocket fatal error: %s", exc, exc_info=True)
        try:
            await websocket.send_json({"type": "error", "content": "Erreur serveur."})
        except Exception:
            pass
    finally:
        db.close()
