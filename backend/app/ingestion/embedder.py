import logging
from uuid import UUID

from sqlalchemy.orm import Session

from app.database.models import Property
from app.database.vector_store import generate_embedding, property_to_text

logger = logging.getLogger(__name__)


def embed_property(db: Session, prop: Property) -> bool:
    """Generate and persist the embedding for a single property. Returns True on success."""
    try:
        prop.embedding = generate_embedding(property_to_text(prop))
        db.commit()
        return True
    except Exception as e:
        logger.error(f"Failed to embed property {prop.id}: {e}")
        db.rollback()
        return False


def embed_all_properties(db: Session, tenant_id: UUID | None = None) -> dict:
    """Embed all properties that are missing an embedding."""
    query = db.query(Property).filter(Property.embedding.is_(None))
    if tenant_id:
        query = query.filter(Property.tenant_id == tenant_id)

    properties = query.all()
    success = failed = 0

    for prop in properties:
        if embed_property(db, prop):
            success += 1
        else:
            failed += 1

    logger.info(f"Embedding run complete: {success} ok, {failed} failed")
    return {"success": success, "failed": failed}


# CLI entry point: python -m app.ingestion.embedder --all
if __name__ == "__main__":
    import argparse
    from app.database.connection import SessionLocal

    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="Embed all un-embedded properties")
    args = parser.parse_args()

    if args.all:
        db = SessionLocal()
        try:
            result = embed_all_properties(db)
            print(f"Done: {result}")
        finally:
            db.close()
