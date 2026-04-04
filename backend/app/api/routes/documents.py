from __future__ import annotations

import logging
import shutil
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.api.schemas import DocumentRead
from app.config import settings
from app.database.models import Document, Property, Tenant, User

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/x-pdf",
}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


def _get_tenant(db: Session) -> Tenant:
    tenant = db.query(Tenant).filter_by(slug="immoplus").first()
    if not tenant:
        raise HTTPException(status_code=500, detail="Tenant not configured.")
    return tenant


def _upload_dir() -> Path:
    path = Path(settings.UPLOAD_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post(
    "/upload/{property_id}",
    response_model=DocumentRead,
    summary="Upload a PDF and analyse it (AnalystAgent)",
)
async def upload_document(
    property_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import asyncio
    from app.agents.analyst import AnalystAgent

    tenant = _get_tenant(db)

    prop = db.query(Property).filter_by(id=property_id, tenant_id=tenant.id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found.")

    if file.content_type not in ALLOWED_CONTENT_TYPES and not (
        file.filename or ""
    ).lower().endswith(".pdf"):
        raise HTTPException(status_code=422, detail="Only PDF files are accepted.")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit.")

    # Save to disk
    doc_id = uuid4()
    safe_name = f"{doc_id}_{Path(file.filename or 'document.pdf').name}"
    dest = _upload_dir() / safe_name
    dest.write_bytes(content)

    # Persist Document record
    doc = Document(
        id=doc_id,
        tenant_id=tenant.id,
        property_id=property_id,
        filename=file.filename or "document.pdf",
        file_url=f"/data/uploads/{safe_name}",
        status="processing",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Run analysis in thread pool (blocking agent → async endpoint)
    agent = AnalystAgent(tenant_id=str(tenant.id))
    try:
        await asyncio.to_thread(
            agent.run,
            {"document_id": str(doc_id), "file_path": str(dest.resolve())},
            db,
        )
        db.refresh(doc)
        logger.info("Document %s analysed — type=%s", doc_id, doc.doc_type)
    except Exception as exc:
        logger.error("AnalystAgent failed: %s", exc, exc_info=True)
        doc.status = "error"
        doc.extracted_data = {"error": str(exc)}
        db.commit()
        db.refresh(doc)

    return doc


# ── Read ──────────────────────────────────────────────────────────────────────

@router.get(
    "/{property_id}",
    response_model=list[DocumentRead],
    summary="List all documents for a property",
)
def list_documents(
    property_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant = _get_tenant(db)
    prop = db.query(Property).filter_by(id=property_id, tenant_id=tenant.id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found.")
    return (
        db.query(Document)
        .filter_by(property_id=property_id)
        .order_by(Document.created_at.desc())
        .all()
    )


@router.get(
    "/doc/{document_id}",
    response_model=DocumentRead,
    summary="Get a document with its extracted data",
)
def get_document(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant = _get_tenant(db)
    doc = db.query(Document).filter_by(id=document_id, tenant_id=tenant.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc
