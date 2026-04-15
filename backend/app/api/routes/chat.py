from __future__ import annotations

import asyncio
import json
import logging
from collections import deque
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.api.schemas import ConversationCreate, ConversationRead, MessageRead
from app.api.utils import sanitize_user_input
from app.database.connection import SessionLocal
from app.database.models import Conversation, Message, Tenant

logger = logging.getLogger(__name__)
router = APIRouter()

_WS_RATE_LIMIT = 10          # max messages per window
_WS_RATE_WINDOW_SEC = 60.0   # sliding window in seconds


# ── Working hours helpers ─────────────────────────────────────────────────────

def _is_within_working_hours(tenant_settings: dict) -> bool:
    """Return True if current Paris time is within configured working hours."""
    working_hours = tenant_settings.get("working_hours", {})
    if not working_hours:
        return True

    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("Europe/Paris"))
    except Exception:
        now = datetime.utcnow()  # fallback: assume UTC≈Paris

    day_names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    day_key = day_names[now.weekday()]
    day_cfg = working_hours.get(day_key, {})

    if not day_cfg.get("enabled", True):
        return False

    open_str = day_cfg.get("open")
    close_str = day_cfg.get("close")
    if not open_str or not close_str:
        return False

    try:
        oh, om = map(int, open_str.split(":"))
        ch, cm = map(int, close_str.split(":"))
        current = now.hour * 60 + now.minute
        return oh * 60 + om <= current <= ch * 60 + cm
    except Exception:
        return True


def _out_of_hours_message(tenant_settings: dict) -> str:
    agency = tenant_settings.get("agency", {})
    phone = agency.get("phone", "")
    email = agency.get("email", "")
    contact = ""
    if phone:
        contact += f" Appelez-nous au {phone}"
    if email:
        contact += f" ou écrivez à {email}"
    contact = contact.strip() + "." if contact else ""
    return (
        "Notre agence est actuellement fermée. "
        f"{contact} "
        "Laissez-moi votre email et je vous recontacte dès l'ouverture."
    ).strip()


# ── Escalation helpers ────────────────────────────────────────────────────────

def _escalation_already_sent(db: Session, conversation_id) -> bool:
    return bool(
        db.query(Message).filter(
            Message.conversation_id == conversation_id,
            Message.role == "system",
            Message.content.like("ESCALATION_SENT:%"),
        ).first()
    )


def _trigger_escalation(conv: Conversation, tenant: Tenant, db: Session) -> None:
    """Send escalation notification to agent and write sentinel to DB."""
    from app.services.email_service import send_email
    from app.database.connection import SessionLocal as _SL

    agent_email = (tenant.email if tenant else None) or "contact@immoplus.fr"
    agency_name = (tenant.settings or {}).get("agency", {}).get("name", "ImmoPlus")
    prospect = conv.prospect_name or "Prospect anonyme"
    criteria = conv.search_criteria or {}

    subject = f"{agency_name} — Prospect à rappeler : {prospect}"
    body = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px">
      <h2 style="color:#1d4ed8">Demande d'escalade vers un humain</h2>
      <p>Le prospect <strong>{prospect}</strong> n'a pas trouvé satisfaction après plusieurs échanges.</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:6px 0;color:#64748b">Email</td><td>{conv.prospect_email or '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Téléphone</td><td>{conv.prospect_phone or '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Critères</td><td>{json.dumps(criteria, ensure_ascii=False)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Conversation</td><td>{conv.id}</td></tr>
      </table>
      <p style="margin-top:16px;color:#64748b;font-size:13px">Message automatique — AutoPilot Immo</p>
    </div>"""

    try:
        send_email(agent_email, subject, body)
        logger.info("Escalation email sent to %s for conv %s", agent_email, conv.id)
    except Exception as exc:
        logger.warning("Escalation email failed: %s", exc)

    # Sentinel — prevents double-triggering
    _db = _SL()
    try:
        _db.add(Message(
            conversation_id=conv.id,
            role="system",
            content=f"ESCALATION_SENT:{datetime.utcnow().isoformat()}",
        ))
        _db.commit()
    finally:
        _db.close()


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

        # Per-connection rate limiter — sliding window
        _msg_timestamps: deque = deque()

        # Welcome message from tenant settings
        tenant_settings = tenant.settings or {}
        welcome = (
            tenant_settings.get("chat_widget", {}).get("welcome_message")
            or "Bonjour ! Je suis l'assistant ImmoPlus. Comment puis-je vous aider ?"
        )
        await websocket.send_json({"type": "assistant", "content": welcome})

        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue

            user_message = sanitize_user_input((payload.get("content") or "").strip())
            if not user_message:
                continue

            # Per-connection rate limit: max 10 messages/minute
            import time as _time
            _now = _time.monotonic()
            while _msg_timestamps and _now - _msg_timestamps[0] > _WS_RATE_WINDOW_SEC:
                _msg_timestamps.popleft()
            if len(_msg_timestamps) >= _WS_RATE_LIMIT:
                await websocket.send_json({
                    "type": "error",
                    "content": "Trop de messages. Veuillez patienter une minute.",
                })
                continue
            _msg_timestamps.append(_now)

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

            # ── Working hours gate ────────────────────────────────────────
            if not _is_within_working_hours(tenant_settings):
                out_of_hours = _out_of_hours_message(tenant_settings)
                db.add(Message(conversation_id=conversation_id, role="assistant", content=out_of_hours))
                db.commit()
                await websocket.send_json({"type": "assistant", "content": out_of_hours})
                continue

            # Typing indicator
            await websocket.send_json({"type": "typing"})

            # Pass previously offered slots (in-memory, same WebSocket session)
            prior_slots = session_slots

            # Run blocking agent in thread pool
            result = {}
            try:
                result = await asyncio.to_thread(
                    agent.run,
                    {
                        "message": user_message,
                        "history": history,
                        "available_slots": prior_slots,
                        "contact_captured": bool(conv.prospect_email),
                        "tenant_settings": tenant_settings,
                    },
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
            newly_qualified = False
            if detected_email and not conv.prospect_email:
                conv.prospect_email = detected_email
                if detected_name and not conv.prospect_name:
                    conv.prospect_name = detected_name
                conv.status = "qualified"
                db.commit()
                newly_qualified = True
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
                conv.status = "visit_booked"
                db.commit()
                await asyncio.to_thread(
                    _send_visit_confirmation_email,
                    conv.prospect_name or "",
                    conv.prospect_email,
                    booked_slot.get("label", ""),
                    property_cards[0]["title"] if property_cards else "Bien ImmoPlus",
                )
                # Notification — visit booked
                try:
                    from app.api.routes.notifications import create_notification
                    await asyncio.to_thread(
                        create_notification, db, conv.tenant_id,
                        "visit_booked",
                        f"RDV confirmé : {conv.prospect_name or 'Prospect'}",
                        booked_slot.get("label", ""),
                        {"conversation_id": str(conv.id)},
                    )
                except Exception:
                    pass

            # Email + notification: qualification (properties found + email known)
            elif property_cards and conv.prospect_email and not prior_slots:
                await asyncio.to_thread(
                    _send_qualification_emails,
                    conv.prospect_name or "",
                    conv.prospect_email,
                    property_cards,
                    str(conversation_id),
                    tenant,
                )
                if newly_qualified:
                    try:
                        from app.api.routes.notifications import create_notification
                        await asyncio.to_thread(
                            create_notification, db, conv.tenant_id,
                            "new_prospect",
                            f"Nouveau prospect qualifié : {conv.prospect_name or conv.prospect_email}",
                            f"{len(property_cards)} bien(s) correspondant(s) trouvé(s)",
                            {"conversation_id": str(conv.id)},
                        )
                    except Exception:
                        pass

            # Send property cards before text (only when properties were found)
            if property_cards:
                await websocket.send_json({"type": "properties", "items": property_cards})

            await websocket.send_json({"type": "assistant", "content": response_text})

            # ── Escalation check ──────────────────────────────────────────
            escalate_after = tenant_settings.get("ai", {}).get("escalate_after_turns", 10)
            user_turn_count = sum(1 for m in history if m["role"] == "user") + 1
            if (
                user_turn_count >= escalate_after
                and not conv.prospect_email
                and not _escalation_already_sent(db, conversation_id)
            ):
                await asyncio.to_thread(_trigger_escalation, conv, tenant, db)
                try:
                    from app.api.routes.notifications import create_notification
                    await asyncio.to_thread(
                        create_notification, db, conv.tenant_id,
                        "escalation",
                        "Prospect demande un conseiller humain",
                        f"Conversation {str(conversation_id)[:8]}… — aucun email capturé",
                        {"conversation_id": str(conv.id)},
                    )
                except Exception:
                    pass
                escalation_notice = (
                    "Je vais transmettre votre demande à l'un de nos conseillers "
                    "qui vous contactera dans les plus brefs délais."
                )
                db.add(Message(conversation_id=conversation_id, role="assistant", content=escalation_notice))
                db.commit()
                await websocket.send_json({"type": "assistant", "content": escalation_notice})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: %s", conversation_id)
    except Exception as exc:
        logger.error("WebSocket fatal error: %s", exc, exc_info=True)
        try:
            await websocket.send_json({"type": "error", "content": "Erreur serveur."})
        except Exception:
            pass
    finally:
        try:
            db.close()
        except Exception:
            pass  # Connection may already be closed by Postgres idle timeout
