import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import settings
from app.database.connection import Base, SessionLocal, engine
from app.api.routes import auth, properties, chat, listings, documents, voice, stats

logger = logging.getLogger(__name__)


def _seed_initial_data() -> None:
    
    """Create default tenant and admin user on first startup."""
    from uuid import uuid4
    from passlib.context import CryptContext
    from app.database.models import Tenant, User  # noqa: imported here to ensure registration

    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter_by(slug="immoplus").first()
        if not tenant:
            tenant = Tenant(
                id=uuid4(),
                name="ImmoPlus",
                slug="immoplus",
                email="contact@immoplus.fr",
                phone="+33 4 72 00 00 00",
                website_url="https://www.immoplus.fr",
                settings={
                    "brand_voice": "professionnel et chaleureux",
                    "default_greeting": "Bonjour, bienvenue chez ImmoPlus !",
                    "escalation_email": "contact@immoplus.fr",
                    "platforms": ["leboncoin", "seloger", "website"],
                    "auto_followup_days": 7,
                    "working_hours": {"start": "09:00", "end": "19:00"},
                    "voice_enabled": True,
                },
            )
            db.add(tenant)
            db.flush()
            logger.info("Tenant ImmoPlus created.")

        if not db.query(User).filter_by(email=settings.ADMIN_EMAIL).first():
            db.add(User(
                tenant_id=tenant.id,
                email=settings.ADMIN_EMAIL,
                hashed_password=pwd_context.hash(settings.ADMIN_PASSWORD),
            ))
            logger.info(f"Admin user {settings.ADMIN_EMAIL} created.")

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db() -> None:
    # Import all models so SQLAlchemy registers them before create_all
    import app.database.models  # noqa

    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()

    Base.metadata.create_all(bind=engine)
    _seed_initial_data()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("AutoPilot Immo started.")
    yield


app = FastAPI(
    title="AutoPilot Immo",
    description="Système multi-agents IA pour agences immobilières",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(properties.router, prefix="/properties", tags=["properties"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(listings.router, prefix="/listings", tags=["listings"])
app.include_router(documents.router, prefix="/documents", tags=["documents"])
app.include_router(voice.router, prefix="/voice", tags=["voice"])
app.include_router(stats.router, prefix="/stats", tags=["system"])


@app.get("/health", tags=["system"])
def health_check():
    return {"status": "ok", "service": "AutoPilot Immo"}




# Serve the frontend widget at /widget/
_WIDGET_DIR = Path(__file__).parent.parent.parent / "frontend" / "widget"
if _WIDGET_DIR.exists():
    app.mount("/widget", StaticFiles(directory=str(_WIDGET_DIR), html=True), name="widget")

# Serve the React dashboard build at /dashboard/ (production)
_DASHBOARD_DIR = Path(__file__).parent.parent.parent / "frontend" / "dashboard" / "dist"
if _DASHBOARD_DIR.exists():
    app.mount("/dashboard", StaticFiles(directory=str(_DASHBOARD_DIR), html=True), name="dashboard")
