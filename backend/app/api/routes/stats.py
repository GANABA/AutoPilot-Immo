from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.database.models import Conversation, Document, Listing, Property, User

router = APIRouter()


@router.get("", tags=["system"])
def get_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {
        "properties": {
            "total": db.query(Property).count(),
            "active": db.query(Property).filter_by(status="active").count(),
        },
        "conversations": {
            "total": db.query(Conversation).count(),
            "open": db.query(Conversation).filter_by(status="open").count(),
        },
        "documents": {
            "total": db.query(Document).count(),
            "done": db.query(Document).filter_by(status="done").count(),
        },
        "listings": {
            "total": db.query(Listing).count(),
            "approved": db.query(Listing).filter_by(status="approved").count(),
        },
    }
