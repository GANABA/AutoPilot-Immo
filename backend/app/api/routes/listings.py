from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.api.schemas import GenerateListingsResult, ListingRead, ListingUpdate
from app.database.models import Listing, Property, Tenant, User

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_tenant(db: Session) -> Tenant:
    tenant = db.query(Tenant).filter_by(slug="immoplus").first()
    if not tenant:
        raise HTTPException(status_code=500, detail="Tenant not configured.")
    return tenant


# ── Generate listings ─────────────────────────────────────────────────────────

@router.post(
    "/generate/{property_id}",
    response_model=GenerateListingsResult,
    summary="Generate platform listings for a property (WriterAgent)",
)
async def generate_listings(
    property_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant = _get_tenant(db)

    prop = db.query(Property).filter_by(id=property_id, tenant_id=tenant.id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found.")

    from app.agents.writer import WriterAgent

    agent = WriterAgent(tenant_id=str(tenant.id))
    try:
        result = await asyncio.to_thread(
            agent.run,
            {"property_id": str(property_id)},
            db,
        )
    except Exception as exc:
        logger.error("WriterAgent error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Agent error: {exc}")

    listings = (
        db.query(Listing)
        .filter_by(property_id=property_id)
        .order_by(Listing.created_at.asc())
        .all()
    )
    return GenerateListingsResult(
        listings=listings,
        platforms=result["platforms"],
    )


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get(
    "/{property_id}",
    response_model=list[ListingRead],
    summary="Get all listings for a property",
)
def get_listings(
    property_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant = _get_tenant(db)
    prop = db.query(Property).filter_by(id=property_id, tenant_id=tenant.id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found.")
    return (
        db.query(Listing)
        .filter_by(property_id=property_id)
        .order_by(Listing.created_at.asc())
        .all()
    )


@router.patch(
    "/listing/{listing_id}",
    response_model=ListingRead,
    summary="Update or approve a listing",
)
def update_listing(
    listing_id: UUID,
    body: ListingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant = _get_tenant(db)
    listing = db.query(Listing).filter_by(id=listing_id, tenant_id=tenant.id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found.")

    if body.title is not None:
        listing.title = body.title
    if body.content is not None:
        listing.content = body.content
    if body.status is not None:
        allowed = {"draft", "approved", "published"}
        if body.status not in allowed:
            raise HTTPException(status_code=422, detail=f"status must be one of {allowed}")
        listing.status = body.status

    db.commit()
    db.refresh(listing)
    return listing
