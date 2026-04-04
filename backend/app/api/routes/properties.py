from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.database.models import Property, Tenant
from app.api.dependencies import get_current_tenant
from app.api.schemas import (
    PropertyCreate, PropertyRead, PropertyList,
    PropertyUpdate, ImportResult,
)
from app.ingestion.csv_importer import import_properties_from_csv
from app.ingestion.embedder import embed_property

router = APIRouter()


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
