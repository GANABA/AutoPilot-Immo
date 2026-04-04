import uuid
from unittest.mock import patch

import pytest
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.database.models import Tenant, User, Property

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@pytest.fixture
def seeded_db(db: Session):
    """Insert one tenant + one admin user."""
    tenant = Tenant(
        id=uuid.uuid4(),
        name="ImmoPlus Test",
        slug=f"immoplus-test-{uuid.uuid4().hex[:6]}",
        email="test@immoplus.fr",
        settings={},
    )
    db.add(tenant)
    db.flush()

    user = User(
        tenant_id=tenant.id,
        email=f"admin-{uuid.uuid4().hex[:6]}@immoplus.fr",
        hashed_password=pwd_context.hash("admin123"),
    )
    db.add(user)
    db.commit()
    return {"tenant": tenant, "user": user}


@pytest.fixture
def auth_headers(client, seeded_db):
    """Return Bearer token headers for the seeded admin user."""
    resp = client.post(
        "/auth/login",
        json={"email": seeded_db["user"].email, "password": "admin123"},
    )
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ── Auth tests ────────────────────────────────────────────────────────────────

def test_login_success(client, seeded_db):
    resp = client.post(
        "/auth/login",
        json={"email": seeded_db["user"].email, "password": "admin123"},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password(client, seeded_db):
    resp = client.post(
        "/auth/login",
        json={"email": seeded_db["user"].email, "password": "wrong"},
    )
    assert resp.status_code == 401


def test_protected_route_requires_auth(client):
    resp = client.get("/properties")
    assert resp.status_code == 401


# ── Property CRUD tests ───────────────────────────────────────────────────────

@patch("app.ingestion.embedder.embed_property", return_value=True)
def test_create_property(mock_embed, client, auth_headers):
    payload = {
        "type": "appartement",
        "title": "T3 Lyon 3ème — test",
        "price": 280000,
        "surface": 68.5,
        "nb_rooms": 3,
        "nb_bedrooms": 2,
        "city": "Lyon",
        "zipcode": "69003",
        "has_balcony": True,
    }
    resp = client.post("/properties", json=payload, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "T3 Lyon 3ème — test"
    assert data["status"] == "active"
    assert data["has_balcony"] is True
    mock_embed.assert_called_once()


@patch("app.ingestion.embedder.embed_property", return_value=True)
def test_list_properties(mock_embed, client, auth_headers, seeded_db, db):
    tenant = seeded_db["tenant"]
    db.add(Property(
        tenant_id=tenant.id,
        type="appartement",
        title="T2 Lyon 6ème",
        price=195000,
        surface=45,
        nb_rooms=2,
        city="Lyon",
        zipcode="69006",
    ))
    db.commit()

    resp = client.get("/properties", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    assert isinstance(body["items"], list)


@patch("app.ingestion.embedder.embed_property", return_value=True)
def test_list_properties_filter_by_city(mock_embed, client, auth_headers, seeded_db, db):
    tenant = seeded_db["tenant"]
    db.add(Property(
        tenant_id=tenant.id,
        type="maison",
        title="Maison Villeurbanne",
        price=350000,
        surface=90,
        nb_rooms=4,
        city="Villeurbanne",
        zipcode="69100",
    ))
    db.commit()

    resp = client.get("/properties?city=Villeurbanne", headers=auth_headers)
    assert resp.status_code == 200
    assert all("villeurbanne" in item["city"].lower() for item in resp.json()["items"])


def test_get_property_not_found(client, auth_headers):
    resp = client.get(f"/properties/{uuid.uuid4()}", headers=auth_headers)
    assert resp.status_code == 404


@patch("app.ingestion.embedder.embed_property", return_value=True)
def test_update_property(mock_embed, client, auth_headers, seeded_db, db):
    tenant = seeded_db["tenant"]
    prop = Property(
        tenant_id=tenant.id,
        type="appartement",
        title="T3 à modifier",
        price=200000,
        surface=60,
        nb_rooms=3,
        city="Lyon",
        zipcode="69007",
    )
    db.add(prop)
    db.commit()

    resp = client.patch(
        f"/properties/{prop.id}",
        json={"price": 210000, "status": "under_offer"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["price"] == 210000
    assert resp.json()["status"] == "under_offer"


@patch("app.ingestion.embedder.embed_property", return_value=True)
def test_delete_property(mock_embed, client, auth_headers, seeded_db, db):
    tenant = seeded_db["tenant"]
    prop = Property(
        tenant_id=tenant.id,
        type="appartement",
        title="T2 à supprimer",
        price=150000,
        surface=40,
        nb_rooms=2,
        city="Lyon",
        zipcode="69002",
    )
    db.add(prop)
    db.commit()

    resp = client.delete(f"/properties/{prop.id}", headers=auth_headers)
    assert resp.status_code == 204

    resp = client.get(f"/properties/{prop.id}", headers=auth_headers)
    assert resp.status_code == 404
