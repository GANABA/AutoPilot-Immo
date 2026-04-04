import os
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

# Set test env vars BEFORE importing app modules
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql://autopilot_user:autopilot_pass@localhost:5433/autopilot_test",
)
os.environ.setdefault("OPENAI_API_KEY", "test-key-not-used")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("ADMIN_EMAIL", "admin@immoplus.fr")
os.environ.setdefault("ADMIN_PASSWORD", "admin123")

from app.main import app  # noqa: E402
from app.database.connection import Base, get_db  # noqa: E402

TEST_DATABASE_URL = os.environ["DATABASE_URL"]


@pytest.fixture(scope="session")
def engine():
    _engine = create_engine(TEST_DATABASE_URL)
    with _engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
    Base.metadata.create_all(_engine)
    yield _engine
    Base.metadata.drop_all(_engine)
    _engine.dispose()


@pytest.fixture
def db(engine):
    """Transactional DB session — rolled back after each test."""
    connection = engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db):
    """TestClient with DB session overridden to use the test transaction.
    lifespan is skipped — tables are already created by the engine fixture."""
    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    # lifespan=False skips init_db() so tests don't need a running seed
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()
