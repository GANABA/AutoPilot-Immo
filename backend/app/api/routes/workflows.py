from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.database.models import Property, Tenant, Conversation

logger = logging.getLogger(__name__)
router = APIRouter()


class WorkflowResult(BaseModel):
    property_id: str
    documents_analyzed: list[str]
    listings_generated: list[str]
    prospects_notified: int
    errors: list[str]
    status: str


def _run_new_property_workflow(property_id: str, tenant_id: str) -> dict:
    """Synchronous wrapper — called in thread pool from background task."""
    from app.agents.orchestrator import OrchestratorAgent
    from app.database.connection import SessionLocal

    db = SessionLocal()
    try:
        agent = OrchestratorAgent(tenant_id=tenant_id)
        return agent.run({"property_id": property_id}, db)
    finally:
        db.close()


@router.post(
    "/new_property/{property_id}",
    response_model=WorkflowResult,
    summary="Trigger full onboarding workflow for a new property",
)
async def trigger_new_property(
    property_id: UUID,
    background_tasks: BackgroundTasks,
    sync: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Triggers the full new-property workflow:
      1. Analyze uploaded documents (DPE, charges, mandat)
      2. Generate listings for Leboncoin, SeLoger, site web
      3. Find prospects with matching search criteria
      4. Email each matching prospect about the new property
      5. Send summary email to the agent

    By default runs in background (returns immediately with status=queued).
    Pass ?sync=true to wait for completion (useful for testing).
    """
    # Verify property exists
    prop = db.query(Property).filter_by(id=property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    tenant = db.query(Tenant).filter_by(slug="immoplus").first()
    if not tenant:
        raise HTTPException(status_code=500, detail="Tenant not configured")

    pid = str(property_id)
    tid = str(tenant.id)

    if sync:
        # Run synchronously (for testing / demo)
        try:
            result = await asyncio.to_thread(_run_new_property_workflow, pid, tid)
            return WorkflowResult(**result, status="done")
        except Exception as exc:
            logger.error("Workflow new_property failed: %s", exc, exc_info=True)
            raise HTTPException(status_code=500, detail=str(exc))
    else:
        # Fire and forget in background
        background_tasks.add_task(_run_new_property_workflow, pid, tid)
        return WorkflowResult(
            property_id=pid,
            documents_analyzed=[],
            listings_generated=[],
            prospects_notified=0,
            errors=[],
            status="queued",
        )


@router.post(
    "/trigger_followups",
    summary="Manually trigger J+7 follow-up emails for all eligible prospects",
)
async def trigger_followups(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Sends follow-up emails to prospects who:
    - Have a known email address
    - Have not booked a visit
    - Have a conversation older than 7 days
    - Have not already received a follow-up

    Normally runs automatically every day at 09:00 via Celery Beat.
    This endpoint allows manual triggering from the dashboard or for testing.
    """
    from app.tasks.followup_tasks import send_followup_drafts

    try:
        result = await asyncio.to_thread(send_followup_drafts)
        return {"status": "done", **result}
    except Exception as exc:
        logger.error("trigger_followups failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))
