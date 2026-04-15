from __future__ import annotations

import csv
import io
import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.database.models import Conversation, Message, Tenant, User

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Helpers ───────────────────────────────────────────────────────────────────

def _conv_to_prospect(conv: Conversation) -> dict:
    msg_count = len([m for m in conv.messages if m.role == "user"])
    last_msg = None
    for m in sorted(conv.messages, key=lambda x: x.created_at, reverse=True):
        if m.role in ("user", "assistant"):
            last_msg = m.content[:120] if m.content else None
            break
    return {
        "id": str(conv.id),
        "channel": conv.channel,
        "prospect_name": conv.prospect_name,
        "prospect_email": conv.prospect_email,
        "prospect_phone": conv.prospect_phone,
        "search_criteria": conv.search_criteria,
        "status": conv.status,
        "notes": conv.notes,
        "call_summary": conv.call_summary,
        "call_duration_sec": conv.call_duration_sec,
        "message_count": msg_count,
        "last_message_preview": last_msg,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
    }


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("")
def list_prospects(
    status: Optional[str] = Query(None),
    channel: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant = db.query(Tenant).filter_by(slug="immoplus").first()
    q = db.query(Conversation).filter(Conversation.tenant_id == tenant.id)

    if status:
        q = q.filter(Conversation.status == status)
    if channel:
        q = q.filter(Conversation.channel == channel)
    if search:
        term = f"%{search}%"
        q = q.filter(or_(
            Conversation.prospect_name.ilike(term),
            Conversation.prospect_email.ilike(term),
            Conversation.prospect_phone.ilike(term),
        ))
    if from_date:
        try:
            q = q.filter(Conversation.created_at >= datetime.fromisoformat(from_date))
        except ValueError:
            pass
    if to_date:
        try:
            q = q.filter(Conversation.created_at <= datetime.fromisoformat(to_date))
        except ValueError:
            pass

    total = q.count()
    convs = q.order_by(desc(Conversation.created_at)).offset(offset).limit(limit).all()

    return {
        "total": total,
        "items": [_conv_to_prospect(c) for c in convs],
    }


@router.get("/export")
def export_prospects_csv(
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant = db.query(Tenant).filter_by(slug="immoplus").first()
    q = db.query(Conversation).filter(Conversation.tenant_id == tenant.id)
    if status:
        q = q.filter(Conversation.status == status)
    convs = q.order_by(desc(Conversation.created_at)).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Nom", "Email", "Téléphone", "Canal", "Statut", "Critères", "Notes", "Date"])
    for c in convs:
        criteria_str = ""
        if c.search_criteria:
            parts = []
            for k, v in c.search_criteria.items():
                if v:
                    parts.append(f"{k}: {v}")
            criteria_str = ", ".join(parts)
        writer.writerow([
            str(c.id),
            c.prospect_name or "",
            c.prospect_email or "",
            c.prospect_phone or "",
            c.channel,
            c.status,
            criteria_str,
            c.notes or "",
            c.created_at.strftime("%Y-%m-%d %H:%M") if c.created_at else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=prospects.csv"},
    )


@router.get("/{prospect_id}")
def get_prospect(
    prospect_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant = db.query(Tenant).filter_by(slug="immoplus").first()
    conv = db.query(Conversation).filter(
        Conversation.id == prospect_id,
        Conversation.tenant_id == tenant.id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Prospect introuvable")

    messages = [
        {
            "id": str(m.id),
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in sorted(conv.messages, key=lambda x: x.created_at)
        if m.role in ("user", "assistant")
    ]

    data = _conv_to_prospect(conv)
    data["messages"] = messages
    return data


@router.patch("/{prospect_id}")
def update_prospect(
    prospect_id: UUID,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant = db.query(Tenant).filter_by(slug="immoplus").first()
    conv = db.query(Conversation).filter(
        Conversation.id == prospect_id,
        Conversation.tenant_id == tenant.id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Prospect introuvable")

    allowed = {"status", "notes", "prospect_name", "prospect_email", "prospect_phone"}
    for key, val in body.items():
        if key in allowed:
            setattr(conv, key, val)

    db.commit()
    return _conv_to_prospect(conv)


@router.post("/{prospect_id}/send-email")
def send_followup_email(
    prospect_id: UUID,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant = db.query(Tenant).filter_by(slug="immoplus").first()
    conv = db.query(Conversation).filter(
        Conversation.id == prospect_id,
        Conversation.tenant_id == tenant.id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Prospect introuvable")
    if not conv.prospect_email:
        raise HTTPException(status_code=400, detail="Aucun email pour ce prospect")

    subject = body.get("subject", "Suivi de votre recherche immobilière")
    message = body.get("message", "")

    try:
        from app.services.email_service import send_email
        agency_name = (tenant.settings or {}).get("agency", {}).get("name", "ImmoPlus")
        send_email(
            to_email=conv.prospect_email,
            subject=subject,
            html_content=f"<p>{message.replace(chr(10), '<br>')}</p>",
            from_name=agency_name,
        )
        # Log as system message
        db.add(Message(
            conversation_id=conv.id,
            role="system",
            content=f"MANUAL_EMAIL_SENT: {subject}",
        ))
        db.commit()
        return {"sent": True}
    except Exception as exc:
        logger.error("Failed to send manual email: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
