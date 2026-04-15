from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.database.models import Property, Tenant, WorkflowRun

logger = logging.getLogger(__name__)
router = APIRouter()


class WorkflowResult(BaseModel):
    property_id: str
    run_id: str = ""
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
    except Exception as exc:
        logger.error("Workflow new_property failed: %s", exc, exc_info=True)
        return {
            "property_id": property_id,
            "run_id": "",
            "documents_analyzed": [],
            "listings_generated": [],
            "prospects_notified": 0,
            "errors": [str(exc)],
        }
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
      1. Analyze uploaded documents (DPE, charges, mandat) — with retry
      2. Generate listings for Leboncoin, SeLoger, site web — with retry
      3. Score prospects against new property (0-100 algorithm)
      4. Email prospects scoring >= threshold (configurable in settings.ai.match_score_threshold)
      5. Email agent summary
      6. Create WorkflowRun record with step-by-step status

    Background (default): returns immediately with status=queued.
    Sync (?sync=true): waits for completion (useful for testing/demo).
    """
    prop = db.query(Property).filter_by(id=property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    tenant = db.query(Tenant).filter_by(slug="immoplus").first()
    if not tenant:
        raise HTTPException(status_code=500, detail="Tenant not configured")

    pid = str(property_id)
    tid = str(tenant.id)

    if sync:
        try:
            result = await asyncio.to_thread(_run_new_property_workflow, pid, tid)
            return WorkflowResult(**result, status="done")
        except Exception as exc:
            logger.error("Workflow new_property sync failed: %s", exc, exc_info=True)
            raise HTTPException(status_code=500, detail=str(exc))
    else:
        background_tasks.add_task(_run_new_property_workflow, pid, tid)
        return WorkflowResult(
            property_id=pid,
            run_id="",
            documents_analyzed=[],
            listings_generated=[],
            prospects_notified=0,
            errors=[],
            status="queued",
        )


@router.get(
    "/runs",
    summary="List recent workflow runs",
)
def list_workflow_runs(
    property_id: str | None = Query(None),
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tenant = db.query(Tenant).filter_by(slug="immoplus").first()
    q = db.query(WorkflowRun).filter(WorkflowRun.tenant_id == tenant.id)
    if property_id:
        q = q.filter(WorkflowRun.entity_id == property_id)
    runs = q.order_by(desc(WorkflowRun.started_at)).limit(limit).all()

    return [
        {
            "id": str(r.id),
            "workflow": r.workflow,
            "entity_id": r.entity_id,
            "status": r.status,
            "steps": r.steps or [],
            "summary": r.summary,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in runs
    ]


@router.get(
    "/runs/{run_id}",
    summary="Get a specific workflow run",
)
def get_workflow_run(
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    run = db.query(WorkflowRun).filter_by(id=run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "id": str(run.id),
        "workflow": run.workflow,
        "entity_id": run.entity_id,
        "status": run.status,
        "steps": run.steps or [],
        "summary": run.summary,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
    }


@router.post(
    "/trigger_followups",
    summary="Manually trigger J+7 follow-up emails for all eligible prospects",
)
async def trigger_followups(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.tasks.followup_tasks import send_followup_drafts

    try:
        result = await asyncio.to_thread(send_followup_drafts)
        return {"status": "done", **result}
    except Exception as exc:
        logger.error("trigger_followups failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))
