from __future__ import annotations

import logging
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.config import settings as app_settings
from app.database.connection import get_db
from app.database.models import Property, Tenant
from app.api.dependencies import get_current_tenant
from app.api.schemas import (
    PropertyCreate, PropertyRead, PropertyList,
    PropertyUpdate, ImportResult,
)
from app.ingestion.csv_importer import import_properties_from_csv
from app.ingestion.embedder import embed_property

logger = logging.getLogger(__name__)
router = APIRouter()

_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_MAX_PHOTO_SIZE = app_settings.MAX_PHOTO_SIZE_MB * 1024 * 1024


@router.get("", response_model=PropertyList)
def list_properties(
    prop_status: str | None = None,
    city: str | None = None,
    prop_type: str | None = None,
    skip: int = 0,
    limit: int = 50,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    query = db.query(Property).filter(Property.tenant_id == tenant.id)
    if prop_status:
        query = query.filter(Property.status == prop_status)
    if city:
        query = query.filter(Property.city.ilike(f"%{city}%"))
    if prop_type:
        query = query.filter(Property.type == prop_type)
    total = query.count()
    items = query.order_by(Property.created_at.desc()).offset(skip).limit(limit).all()
    return PropertyList(items=items, total=total)


# NOTE: /import/csv must be declared before /{property_id} to avoid
# FastAPI matching "import" as a UUID.
@router.post("/import/csv", response_model=ImportResult)
def import_csv(
    file: UploadFile = File(...),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")
    content = file.file.read().decode("utf-8")
    return import_properties_from_csv(db, content, tenant_id=tenant.id)


@router.post("", response_model=PropertyRead, status_code=status.HTTP_201_CREATED)
def create_property(
    body: PropertyCreate,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    prop = Property(**body.model_dump(), tenant_id=tenant.id)
    db.add(prop)
    db.commit()
    db.refresh(prop)
    embed_property(db, prop)
    return prop


@router.get("/{property_id}", response_model=PropertyRead)
def get_property(
    property_id: UUID,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    prop = db.query(Property).filter(
        Property.id == property_id,
        Property.tenant_id == tenant.id,
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


@router.patch("/{property_id}", response_model=PropertyRead)
def update_property(
    property_id: UUID,
    body: PropertyUpdate,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    prop = db.query(Property).filter(
        Property.id == property_id,
        Property.tenant_id == tenant.id,
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(prop, field, value)
    db.commit()
    db.refresh(prop)
    embed_property(db, prop)
    return prop


@router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_property(
    property_id: UUID,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    prop = db.query(Property).filter(
        Property.id == property_id,
        Property.tenant_id == tenant.id,
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    db.delete(prop)
    db.commit()


# ── Photo upload ───────────────────────────────────────────────────────────────

@router.post("/{property_id}/photos", response_model=PropertyRead)
async def upload_photos(
    property_id: UUID,
    files: list[UploadFile] = File(...),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    """
    Upload one or more photos for a property.
    Appends URLs to Property.photos (does not replace existing ones).
    Accepted formats: JPEG, PNG, WebP, GIF (max 10 MB each).
    """
    prop = db.query(Property).filter(
        Property.id == property_id,
        Property.tenant_id == tenant.id,
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    upload_dir = Path(app_settings.UPLOAD_DIR) / "properties" / str(property_id)
    upload_dir.mkdir(parents=True, exist_ok=True)

    new_urls: list[str] = []
    for file in files:
        if file.content_type not in _ALLOWED_IMAGE_TYPES and not any(
            (file.filename or "").lower().endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif")
        ):
            raise HTTPException(status_code=422, detail=f"'{file.filename}' is not an accepted image format.")

        content = await file.read()
        if len(content) > _MAX_PHOTO_SIZE:
            raise HTTPException(status_code=413, detail=f"'{file.filename}' exceeds {app_settings.MAX_PHOTO_SIZE_MB} MB limit.")

        file_id = uuid4()
        suffix = Path(file.filename or "photo.jpg").suffix or ".jpg"
        dest = upload_dir / f"{file_id}{suffix}"
        dest.write_bytes(content)

        url = f"/data/uploads/properties/{property_id}/{file_id}{suffix}"
        new_urls.append(url)
        logger.info("Photo uploaded for property %s: %s", property_id, url)

    prop.photos = list(prop.photos or []) + new_urls
    db.commit()
    db.refresh(prop)
    return prop


@router.delete("/{property_id}/photos", response_model=PropertyRead)
def delete_photo(
    property_id: UUID,
    url: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    """Remove a single photo URL from a property (pass as ?url=...)."""
    prop = db.query(Property).filter(
        Property.id == property_id,
        Property.tenant_id == tenant.id,
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    prop.photos = [p for p in (prop.photos or []) if p != url]
    db.commit()
    db.refresh(prop)
    return prop
