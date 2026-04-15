from __future__ import annotations

import logging
from collections import Counter, defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.database.models import Conversation, Message, Tenant, User

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_tenant(db: Session) -> Tenant:
    return db.query(Tenant).filter_by(slug="immoplus").first()


@router.get("/overview")
def get_overview(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant = _get_tenant(db)
    since = datetime.utcnow() - timedelta(days=days)

    all_convs = db.query(Conversation).filter(
        Conversation.tenant_id == tenant.id,
        Conversation.created_at >= since,
    ).all()

    total = len(all_convs)
    qualified = sum(1 for c in all_convs if c.status in ("qualified", "visit_booked", "closed"))
    visit_booked = sum(1 for c in all_convs if c.status == "visit_booked")
    closed = sum(1 for c in all_convs if c.status == "closed")
    by_channel = Counter(c.channel for c in all_convs)

    # Previous period for trend
    prev_since = since - timedelta(days=days)
    prev_convs = db.query(Conversation).filter(
        Conversation.tenant_id == tenant.id,
        Conversation.created_at >= prev_since,
        Conversation.created_at < since,
    ).count()

    return {
        "period_days": days,
        "conversations": {
            "total": total,
            "previous_period": prev_convs,
            "trend_pct": round((total - prev_convs) / max(prev_convs, 1) * 100, 1),
        },
        "qualification_rate": round(qualified / max(total, 1) * 100, 1),
        "visit_booking_rate": round(visit_booked / max(total, 1) * 100, 1),
        "conversion_rate": round(closed / max(total, 1) * 100, 1),
        "by_channel": dict(by_channel),
        "by_status": {
            "open": sum(1 for c in all_convs if c.status == "open"),
            "qualified": qualified - visit_booked - closed,
            "visit_booked": visit_booked,
            "closed": closed,
        },
    }


@router.get("/timeline")
def get_timeline(
    days: int = Query(30, ge=7, le=365),
    granularity: str = Query("day"),  # day | week
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant = _get_tenant(db)
    since = datetime.utcnow() - timedelta(days=days)

    convs = db.query(Conversation).filter(
        Conversation.tenant_id == tenant.id,
        Conversation.created_at >= since,
    ).all()

    # Bucket by day or week
    buckets: dict[str, dict] = defaultdict(lambda: {"total": 0, "qualified": 0, "visits": 0})
    for c in convs:
        if not c.created_at:
            continue
        if granularity == "week":
            key = c.created_at.strftime("%Y-W%W")
        else:
            key = c.created_at.strftime("%Y-%m-%d")
        buckets[key]["total"] += 1
        if c.status in ("qualified", "visit_booked", "closed"):
            buckets[key]["qualified"] += 1
        if c.status == "visit_booked":
            buckets[key]["visits"] += 1

    # Fill missing days
    result = []
    if granularity == "day":
        for i in range(days):
            day = (datetime.utcnow() - timedelta(days=days - 1 - i)).strftime("%Y-%m-%d")
            entry = buckets.get(day, {"total": 0, "qualified": 0, "visits": 0})
            result.append({"date": day, **entry})
    else:
        for key in sorted(buckets.keys()):
            result.append({"date": key, **buckets[key]})

    return result


@router.get("/top-searches")
def get_top_searches(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant = _get_tenant(db)
    since = datetime.utcnow() - timedelta(days=days)

    convs = db.query(Conversation).filter(
        Conversation.tenant_id == tenant.id,
        Conversation.created_at >= since,
        Conversation.search_criteria.isnot(None),
    ).all()

    type_counter: Counter = Counter()
    city_counter: Counter = Counter()
    budget_ranges: list[float] = []
    surface_ranges: list[float] = []

    for c in convs:
        if not c.search_criteria:
            continue
        crit = c.search_criteria
        if crit.get("property_type"):
            type_counter[crit["property_type"]] += 1
        if crit.get("city"):
            city_counter[crit["city"]] += 1
        if crit.get("max_price") and crit["max_price"]:
            try:
                budget_ranges.append(float(crit["max_price"]))
            except (ValueError, TypeError):
                pass
        if crit.get("min_surface") and crit["min_surface"]:
            try:
                surface_ranges.append(float(crit["min_surface"]))
            except (ValueError, TypeError):
                pass

    avg_budget = round(sum(budget_ranges) / len(budget_ranges)) if budget_ranges else None
    avg_surface = round(sum(surface_ranges) / len(surface_ranges)) if surface_ranges else None

    return {
        "top_types": type_counter.most_common(5),
        "top_cities": city_counter.most_common(5),
        "avg_budget": avg_budget,
        "avg_surface": avg_surface,
        "total_with_criteria": len(convs),
    }


@router.get("/response-time")
def get_response_time(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Average time between first user message and first assistant response."""
    tenant = _get_tenant(db)
    since = datetime.utcnow() - timedelta(days=days)

    convs = db.query(Conversation).filter(
        Conversation.tenant_id == tenant.id,
        Conversation.created_at >= since,
    ).all()

    response_times_ms: list[float] = []
    for conv in convs:
        msgs = sorted(conv.messages, key=lambda m: m.created_at)
        first_user = next((m for m in msgs if m.role == "user"), None)
        first_assistant = next((m for m in msgs if m.role == "assistant"), None)
        if first_user and first_assistant and first_assistant.created_at and first_user.created_at:
            delta = (first_assistant.created_at - first_user.created_at).total_seconds() * 1000
            if 0 < delta < 60_000:  # ignore outliers > 1 min
                response_times_ms.append(delta)

    avg_ms = round(sum(response_times_ms) / len(response_times_ms)) if response_times_ms else None
    return {
        "avg_response_ms": avg_ms,
        "sample_size": len(response_times_ms),
    }
