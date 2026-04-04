import csv
import io
import logging
from uuid import UUID

from sqlalchemy.orm import Session

from app.database.models import Property
from app.api.schemas import ImportResult

logger = logging.getLogger(__name__)

BOOL_FIELDS = {"has_balcony", "has_parking", "has_elevator"}
INT_FIELDS = {"nb_rooms", "nb_bedrooms", "floor"}
FLOAT_FIELDS = {"price", "surface", "charges_monthly"}
SKIP_FIELDS = {"embedding"}  # never imported from CSV


def _parse_bool(value: str) -> bool:
    return value.strip().lower() in ("true", "1", "oui", "yes")


def import_properties_from_csv(
    db: Session, content: str, tenant_id: UUID
) -> ImportResult:
    reader = csv.DictReader(io.StringIO(content))
    imported = 0
    skipped = 0
    errors: list[str] = []
    new_properties: list[Property] = []

    for i, row in enumerate(reader, start=2):  # row 1 = header
        try:
            ref = (row.get("reference") or "").strip()
            if ref:
                exists = db.query(Property).filter_by(
                    tenant_id=tenant_id, reference=ref
                ).first()
                if exists:
                    skipped += 1
                    continue

            data: dict = {"tenant_id": tenant_id}
            for key, value in row.items():
                key = key.strip()
                if not value or not value.strip() or key in SKIP_FIELDS:
                    continue
                value = value.strip()

                if key in BOOL_FIELDS:
                    data[key] = _parse_bool(value)
                elif key in INT_FIELDS:
                    data[key] = int(value)
                elif key in FLOAT_FIELDS:
                    data[key] = float(value)
                elif key == "photos":
                    data[key] = [v.strip() for v in value.split("|") if v.strip()]
                else:
                    data[key] = value

            prop = Property(**data)
            db.add(prop)
            db.flush()  # get id without committing
            new_properties.append(prop)
            imported += 1

        except Exception as e:
            errors.append(f"Row {i}: {e}")
            logger.warning(f"CSV import error row {i}: {e}")

    # Commit all valid properties before attempting embeddings
    db.commit()

    # Best-effort embedding — failures don't block the import
    from app.ingestion.embedder import embed_property
    for prop in new_properties:
        embed_property(db, prop)

    return ImportResult(imported=imported, skipped=skipped, errors=errors)
