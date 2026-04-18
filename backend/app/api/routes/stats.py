from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.database.models import Conversation, Document, Listing, Property, Tenant, User

router = APIRouter()


@router.get("/morning-brief", tags=["system"])
def get_morning_brief(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Morning brief: overnight prospects/calls, today's visits, pipeline summary."""
    tenant = db.query(Tenant).filter_by(slug="immoplus").first()
    if not tenant:
        return {
            "overnight_prospects": [],
            "overnight_calls": [],
            "todays_visits": [],
            "pipeline_summary": {"open": 0, "qualified": 0, "visit_booked": 0, "closed": 0},
        }

    now = datetime.now(timezone.utc)
    # "yesterday 18h" if it's before 18h today, else "today 18h"
    cutoff = now.replace(hour=18, minute=0, second=0, microsecond=0) - timedelta(
        days=0 if now.hour >= 18 else 1
    )

    def _conv_dict(conv: Conversation) -> dict:
        return {
            "id": str(conv.id),
            "prospect_name": conv.prospect_name,
            "prospect_email": conv.prospect_email,
            "prospect_phone": conv.prospect_phone,
            "status": conv.status,
            "channel": conv.channel,
            "search_criteria": conv.search_criteria,
            "call_summary": conv.call_summary,
            "created_at": conv.created_at.isoformat() if conv.created_at else None,
        }

    # Overnight qualified prospects
    overnight_prospects = [
        _conv_dict(c)
        for c in db.query(Conversation).filter(
            Conversation.tenant_id == tenant.id,
            Conversation.status.in_(["qualified", "visit_booked"]),
            Conversation.created_at >= cutoff,
        ).all()
    ]

    # Overnight phone calls
    overnight_calls = [
        _conv_dict(c)
        for c in db.query(Conversation).filter(
            Conversation.tenant_id == tenant.id,
            Conversation.channel == "phone",
            Conversation.created_at >= cutoff,
        ).all()
    ]

    # Today's booked visits
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    todays_visits: list[dict] = []
    for conv in db.query(Conversation).filter(
        Conversation.tenant_id == tenant.id,
        Conversation.status == "visit_booked",
        Conversation.visit_booked_at >= today_start,
        Conversation.visit_booked_at < today_end,
    ).all():
        entry = _conv_dict(conv)
        entry["visit_booked_at"] = (
            conv.visit_booked_at.isoformat() if conv.visit_booked_at else None
        )
        entry["visit_property_id"] = (
            str(conv.visit_property_id) if conv.visit_property_id else None
        )
        if conv.visited_property:
            entry["visited_property"] = {
                "title": conv.visited_property.title,
                "city": conv.visited_property.city,
                "price": conv.visited_property.price,
            }
        else:
            entry["visited_property"] = None
        todays_visits.append(entry)

    # Pipeline summary
    pipeline_summary: dict[str, int] = {}
    for status_val in ("open", "qualified", "visit_booked", "closed"):
        pipeline_summary[status_val] = (
            db.query(Conversation)
            .filter(Conversation.tenant_id == tenant.id, Conversation.status == status_val)
            .count()
        )

    return {
        "overnight_prospects": overnight_prospects,
        "overnight_calls": overnight_calls,
        "todays_visits": todays_visits,
        "pipeline_summary": pipeline_summary,
    }


@router.get("", tags=["system"])
def get_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {
        "properties": {
            "total": db.query(Property).count(),
            "active": db.query(Property).filter_by(status="active").count(),
        },
        "conversations": {
            "total": db.query(Conversation).count(),
            "open": db.query(Conversation).filter_by(status="open").count(),
        },
        "documents": {
            "total": db.query(Document).count(),
            "done": db.query(Document).filter_by(status="done").count(),
        },
        "listings": {
            "total": db.query(Listing).count(),
            "approved": db.query(Listing).filter_by(status="approved").count(),
        },
    }
