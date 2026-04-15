from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.api.schemas import TenantSettings, CrawlStatus
from app.api.utils import is_safe_url
from app.database.models import Tenant

logger = logging.getLogger(__name__)
router = APIRouter()


def _deep_merge(base: dict, update: dict) -> dict:
    """Recursively merge update into base. update values take precedence."""
    result = dict(base)
    for key, value in update.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def _get_tenant(db: Session) -> Tenant:
    tenant = db.query(Tenant).filter_by(slug="immoplus").first()
    if not tenant:
        raise HTTPException(status_code=500, detail="Tenant non configuré.")
    return tenant


# ── GET /settings ──────────────────────────────────────────────────────────────

@router.get("", response_model=TenantSettings)
def get_settings(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return the current tenant settings, filling defaults for missing keys."""
    tenant = _get_tenant(db)
    return TenantSettings.from_db(tenant.settings)


# ── PATCH /settings ────────────────────────────────────────────────────────────

@router.patch("", response_model=TenantSettings)
def update_settings(
    body: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Deep-merge the provided dict into current settings.
    You can send a partial update of any section:
      {"agency": {"name": "Nouveau nom"}}
    Only the provided fields are updated; everything else is preserved.
    """
    tenant = _get_tenant(db)
    current_raw = tenant.settings or {}
    merged = _deep_merge(current_raw, body)

    # Validate the merged result against the full schema
    try:
        validated = TenantSettings(**merged)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Paramètres invalides : {exc}")

    # Validate website_url is not a local/internal address
    website_url = validated.agency.website_url or ""
    if website_url and not is_safe_url(website_url):
        raise HTTPException(
            status_code=422,
            detail="website_url doit être une URL publique (http/https, pas d'adresse locale).",
        )

    tenant.settings = validated.model_dump()
    db.commit()
    logger.info("Settings updated by %s", current_user.email)
    return validated


# ── POST /settings/crawl-website ──────────────────────────────────────────────

def _run_crawl(tenant_id: str, website_url: str) -> CrawlStatus:
    """Synchronous crawl — called in thread pool."""
    from app.services.crawler_service import crawl_website
    from app.database.connection import SessionLocal

    db = SessionLocal()
    try:
        return crawl_website(tenant_id=tenant_id, website_url=website_url, db=db)
    finally:
        db.close()


@router.post("/crawl-website", response_model=CrawlStatus)
async def crawl_website_endpoint(
    background_tasks: BackgroundTasks,
    sync: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Crawl the agency website configured in settings.agency.website_url.
    Extracts text, generates embeddings, stores in KnowledgeChunk table.
    The SupportAgent will use this content to answer questions about the agency.

    By default runs in background (returns immediately).
    Pass ?sync=true to wait for completion.
    """
    tenant = _get_tenant(db)
    s = TenantSettings.from_db(tenant.settings)
    website_url = s.agency.website_url

    if not website_url:
        raise HTTPException(
            status_code=400,
            detail="Aucune URL de site web configurée. Ajoutez-la dans Paramètres > Agence.",
        )

    tid = str(tenant.id)

    if sync:
        try:
            result = await asyncio.to_thread(_run_crawl, tid, website_url)
            return result
        except Exception as exc:
            logger.error("Crawl failed: %s", exc, exc_info=True)
            raise HTTPException(status_code=500, detail=str(exc))
    else:
        background_tasks.add_task(_run_crawl, tid, website_url)
        return CrawlStatus(status="started", message=f"Crawl de {website_url} lancé en arrière-plan.")
