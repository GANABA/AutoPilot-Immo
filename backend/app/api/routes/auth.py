from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.database.connection import get_db
from app.database.models import User
from app.api.schemas import TokenResponse, LoginRequest
from app.api.limiter import limiter

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Token helpers ─────────────────────────────────────────────────────────────

def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    return jwt.encode(
        {"sub": user_id, "type": "access", "exp": expire, "jti": uuid.uuid4().hex},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def create_refresh_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    return jwt.encode(
        {"sub": user_id, "type": "refresh", "exp": expire, "jti": uuid.uuid4().hex},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def _redis_client():
    """Lazy Redis client — returns None if Redis is unavailable."""
    try:
        import redis as redis_lib
        r = redis_lib.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=1)
        r.ping()
        return r
    except Exception:
        return None


def _blacklist_token(token: str, expire_seconds: int) -> None:
    """Add a token to the Redis blacklist."""
    try:
        r = _redis_client()
        if r:
            r.setex(f"bl:{token[-32:]}", expire_seconds, "1")
    except Exception:
        pass  # graceful degradation — logout still succeeds


def is_token_blacklisted(token: str) -> bool:
    """Return True if token has been explicitly revoked."""
    try:
        r = _redis_client()
        if r:
            return bool(r.exists(f"bl:{token[-32:]}"))
    except Exception:
        pass
    return False


def _authenticate_user(email: str, password: str, db: Session) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user or not pwd_context.verify(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/token", response_model=TokenResponse, summary="OAuth2 password flow")
def login_form(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Standard OAuth2 form login (OpenAPI 'Authorize' button)."""
    user = _authenticate_user(form_data.username, form_data.password, db)
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/login", response_model=TokenResponse, summary="JSON login")
@limiter.limit("5/minute")
def login_json(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    """JSON login — used by the React dashboard. Rate-limited to 5/minute per IP."""
    user = _authenticate_user(body.email, body.password, db)
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=TokenResponse, summary="Refresh access token")
def refresh_token(request: Request, db: Session = Depends(get_db)):
    """
    Exchange a valid (non-revoked) refresh token for a new pair.
    Send the refresh token in the Authorization header: Bearer <refresh_token>
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Refresh token required.")

    token = auth_header[len("Bearer "):]

    if is_token_blacklisted(token):
        raise HTTPException(status_code=401, detail="Token has been revoked.")

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token.")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Not a refresh token.")

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive.")

    # Rotate: blacklist old refresh token, issue new pair
    exp = payload.get("exp", 0)
    remaining = max(0, exp - int(datetime.now(timezone.utc).timestamp()))
    _blacklist_token(token, remaining)

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/logout", summary="Revoke refresh token")
def logout(request: Request):
    """
    Blacklist the provided refresh token.
    Send it in the Authorization header: Bearer <refresh_token>
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return {"ok": True}  # no token = already logged out

    token = auth_header[len("Bearer "):]

    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM],
            options={"verify_exp": False},  # blacklist even if already expired
        )
        exp = payload.get("exp", 0)
        remaining = max(60, exp - int(datetime.now(timezone.utc).timestamp()))
        _blacklist_token(token, remaining)
    except Exception:
        pass  # token invalid → treat as already logged out

    return {"ok": True}
