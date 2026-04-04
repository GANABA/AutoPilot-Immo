from __future__ import annotations

import logging

from app.tasks.celery_app import app as celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=2, default_retry_delay=10)
def analyze_document_task(self, document_id: str, file_path: str, tenant_id: str):
    """
    Celery task: run AnalystAgent on an uploaded PDF.

    Called after a document is uploaded. Updates the Document record
    with extracted data and sets status to 'done' (or 'error').
    """
    from app.database.connection import SessionLocal
    from app.database.models import Document
    from app.agents.analyst import AnalystAgent

    db = SessionLocal()
    try:
        doc = db.query(Document).filter_by(id=document_id).first()
        if not doc:
            logger.error("Document %s not found", document_id)
            return

        doc.status = "processing"
        db.commit()

        agent = AnalystAgent(tenant_id=tenant_id)
        result = agent.run(
            {"document_id": document_id, "file_path": file_path},
            db,
        )
        logger.info(
            "Document %s analysed — type=%s pages=%d",
            document_id,
            result["doc_type"],
            result["page_count"],
        )

    except Exception as exc:
        logger.error("analyze_document_task failed: %s", exc, exc_info=True)
        try:
            doc = db.query(Document).filter_by(id=document_id).first()
            if doc:
                doc.status = "error"
                doc.extracted_data = {"error": str(exc)}
                db.commit()
        except Exception:
            pass
        raise self.retry(exc=exc)
    finally:
        db.close()
