from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

# Build connect_args — add SSL for Supabase/cloud URLs, keep utf8 always
_connect_args: dict = {"client_encoding": "utf8"}
if "supabase.co" in settings.DATABASE_URL or "sslmode=require" in settings.DATABASE_URL:
    _connect_args["sslmode"] = "require"

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    connect_args=_connect_args,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
