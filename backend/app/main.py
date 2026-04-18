from __future__ import annotations

import logging
import logging.config
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import settings
from app.database.connection import Base, SessionLocal, engine
from app.api.routes import (  # noqa: E501
    auth, properties, chat, listings, documents, voice,
    stats, workflows, settings as settings_routes,
    prospects, analytics, notifications as notif_routes,
)

# ── Structured JSON logging ───────────────────────────────────────────────────

def setup_logging() -> None:
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    class _JsonFormatter(logging.Formatter):
        def format(self, record: logging.LogRecord) -> str:
            import json, traceback
            data: dict = {
                "ts":      self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
                "level":   record.levelname,
                "logger":  record.name,
                "msg":     record.getMessage(),
            }
            if record.exc_info:
                data["exc"] = traceback.format_exception(*record.exc_info)[-1].strip()
            return json.dumps(data, ensure_ascii=False)

    root = logging.getLogger()
    root.setLevel(log_level)
    if not root.handlers:
        h = logging.StreamHandler()
        h.setFormatter(_JsonFormatter())
        root.addHandler(h)
    else:
        for h in root.handlers:
            h.setFormatter(_JsonFormatter())


setup_logging()
logger = logging.getLogger(__name__)


# ── Rate limiter (slowapi) ────────────────────────────────────────────────────

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.api.limiter import limiter

# ── Input sanitisation + URL validation (shared utils) ───────────────────────

from app.api.utils import sanitize_user_input, is_safe_url  # noqa: F401 — re-exported


# ── DB init ───────────────────────────────────────────────────────────────────

def _seed_initial_data() -> None:
    """Create default tenant and admin user on first startup."""
    from uuid import uuid4
    from passlib.context import CryptContext
    from app.database.models import Tenant, User  # noqa

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
            logger.info("Admin user %s created.", settings.ADMIN_EMAIL)

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


_CONVERSATION_MIGRATIONS = [
    ("notes",               "TEXT"),
    ("call_summary",        "TEXT"),
    ("call_duration_sec",   "INTEGER"),
    ("visit_property_id",   "UUID REFERENCES properties(id)"),
    ("visit_booked_at",     "TIMESTAMPTZ"),
    ("voice_call_id",       "VARCHAR"),
]

_PROPERTY_MIGRATIONS = [
    ("status_workflow",      "VARCHAR DEFAULT 'draft'"),
    ("mandate_ref",          "VARCHAR"),
    ("mandate_type",         "VARCHAR"),
    ("agency_fees_percent",  "FLOAT"),
    ("ges_class",            "VARCHAR"),
    ("annual_energy_cost",   "FLOAT"),
    ("has_cellar",           "BOOLEAN DEFAULT FALSE"),
    ("has_garden",           "BOOLEAN DEFAULT FALSE"),
    ("orientation",          "VARCHAR"),
    ("lot_count",            "INTEGER"),
    ("syndic_name",          "VARCHAR"),
    ("diagnostics",          "JSONB"),
]


def init_db() -> None:
    import app.database.models  # noqa — register all models

    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()

    Base.metadata.create_all(bind=engine)

    # Run inline DDL migrations — each column in its own connection so a timeout
    # on one statement does not abort the others.  We disable statement_timeout
    # at session scope (SET, not SET LOCAL) to override Render's role-level default.
    all_migrations = (
        [("properties", n, d) for n, d in _PROPERTY_MIGRATIONS]
        + [("conversations", n, d) for n, d in _CONVERSATION_MIGRATIONS]
    )
    for table, col_name, col_def in all_migrations:
        try:
            with engine.connect() as conn:
                conn.execute(text("SET statement_timeout = 0"))
                conn.execute(text(
                    f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col_name} {col_def}"
                ))
                conn.commit()
        except Exception as exc:
            logger.warning("DDL migration skipped (%s.%s): %s", table, col_name, exc)

    _seed_initial_data()


# ── App factory ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("AutoPilot Immo started — env=%s log=%s", settings.PUBLIC_URL, settings.LOG_LEVEL)
    yield


app = FastAPI(
    title="AutoPilot Immo",
    description="Système multi-agents IA pour agences immobilières",
    version="2.0.0",
    lifespan=lifespan,
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth.router,           prefix="/auth",          tags=["auth"])
app.include_router(properties.router,     prefix="/properties",    tags=["properties"])
app.include_router(chat.router,           prefix="/chat",          tags=["chat"])
app.include_router(listings.router,       prefix="/listings",      tags=["listings"])
app.include_router(documents.router,      prefix="/documents",     tags=["documents"])
app.include_router(voice.router,          prefix="/voice",         tags=["voice"])
app.include_router(stats.router,          prefix="/stats",         tags=["system"])
app.include_router(workflows.router,      prefix="/workflows",     tags=["workflows"])
app.include_router(settings_routes.router,prefix="/settings",      tags=["settings"])
app.include_router(prospects.router,      prefix="/prospects",     tags=["crm"])
app.include_router(analytics.router,      prefix="/analytics",     tags=["analytics"])
app.include_router(notif_routes.router,   prefix="/notifications", tags=["notifications"])


# ── Health check (enriched) ───────────────────────────────────────────────────

@app.get("/health", tags=["system"])
def health_check():
    """Enriched health check — verifies DB, Redis, and external APIs."""
    from app.database.connection import SessionLocal as _SL

    checks: dict = {}

    # Database
    try:
        db = _SL()
        db.execute(text("SELECT 1"))
        db.close()
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {exc}"

    # Redis
    try:
        import redis as redis_lib
        r = redis_lib.from_url(settings.REDIS_URL, socket_connect_timeout=1)
        r.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"

    # OpenAI API (lightweight — just checks the API key is accepted)
    try:
        if settings.OPENAI_API_KEY:
            from openai import OpenAI
            client = OpenAI(api_key=settings.OPENAI_API_KEY)
            client.models.list()
            checks["openai"] = "ok"
        else:
            checks["openai"] = "not configured"
    except Exception as exc:
        checks["openai"] = f"error: {exc}"

    # Vapi (optional)
    checks["vapi"] = "configured" if settings.VAPI_API_KEY else "not configured"

    # Overall status
    has_error = any("error" in str(v) for v in checks.values())
    return JSONResponse(
        content={"status": "degraded" if has_error else "ok", "checks": checks},
        status_code=200 if not has_error else 207,
    )


# ── Static files ──────────────────────────────────────────────────────────────

_UPLOADS_DIR = Path(settings.UPLOAD_DIR)
_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/data/uploads", StaticFiles(directory=str(_UPLOADS_DIR)), name="uploads")

_WIDGET_DIR = Path(__file__).parent.parent.parent / "frontend" / "widget"
if _WIDGET_DIR.exists():
    app.mount("/widget", StaticFiles(directory=str(_WIDGET_DIR), html=True), name="widget")

_DASHBOARD_DIR = Path(__file__).parent.parent.parent / "frontend" / "dashboard" / "dist"
if _DASHBOARD_DIR.exists():
    app.mount("/dashboard", StaticFiles(directory=str(_DASHBOARD_DIR), html=True), name="dashboard")
