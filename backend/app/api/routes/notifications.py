from __future__ import annotations

import asyncio
import json
import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.database.connection import SessionLocal
from app.database.models import Notification, Tenant, User

logger = logging.getLogger(__name__)
router = APIRouter()

# ── In-process broadcast bus ──────────────────────────────────────────────────
# Each entry is an asyncio.Queue belonging to a connected dashboard client.
_subscribers: list[asyncio.Queue] = []


async def broadcast(event: dict) -> None:
    """Push an event to all connected dashboard WebSocket clients."""
    for q in list(_subscribers):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass


def create_notification(
    db: Session,
    tenant_id: Any,
    notif_type: str,
    title: str,
    body: str | None = None,
    data: dict | None = None,
) -> Notification:
    """Create a persisted notification and broadcast it to dashboard clients."""
    notif = Notification(
        tenant_id=tenant_id,
        type=notif_type,
        title=title,
        body=body,
        data=data or {},
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)

    # Fire-and-forget broadcast (non-async context)
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(broadcast({
                "type": "notification",
                "id": str(notif.id),
                "notif_type": notif_type,
                "title": title,
                "body": body,
                "data": data or {},
                "created_at": notif.created_at.isoformat() if notif.created_at else None,
            }))
    except Exception:
        pass  # broadcast is best-effort

    return notif


# ── REST endpoints ────────────────────────────────────────────────────────────

@router.get("")
def list_notifications(
    unread_only: bool = False,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant = db.query(Tenant).filter_by(slug="immoplus").first()
    q = db.query(Notification).filter(Notification.tenant_id == tenant.id)
    if unread_only:
        q = q.filter(Notification.is_read == False)  # noqa: E712
    notifs = q.order_by(Notification.created_at.desc()).limit(limit).all()
    unread_count = db.query(Notification).filter(
        Notification.tenant_id == tenant.id,
        Notification.is_read == False,  # noqa: E712
    ).count()

    return {
        "unread_count": unread_count,
        "items": [
            {
                "id": str(n.id),
                "type": n.type,
                "title": n.title,
                "body": n.body,
                "data": n.data,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in notifs
        ],
    }


@router.patch("/{notif_id}/read")
def mark_read(
    notif_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notif = db.query(Notification).filter(Notification.id == notif_id).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {"ok": True}


@router.patch("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant = db.query(Tenant).filter_by(slug="immoplus").first()
    db.query(Notification).filter(
        Notification.tenant_id == tenant.id,
        Notification.is_read == False,  # noqa: E712
    ).update({"is_read": True})
    db.commit()
    return {"ok": True}


# ── WebSocket — real-time push ────────────────────────────────────────────────

@router.websocket("/ws")
async def notifications_ws(websocket: WebSocket, token: str = ""):
    await websocket.accept()

    # Validate JWT token — close with 4001 if invalid
    if token:
        try:
            from jose import jwt, JWTError
            from app.config import settings as _cfg
            payload = jwt.decode(token, _cfg.SECRET_KEY, algorithms=[_cfg.ALGORITHM])
            if payload.get("type") == "refresh":
                raise ValueError("refresh token not accepted")
        except Exception:
            await websocket.send_text(json.dumps({"type": "error", "detail": "Unauthorized"}))
            await websocket.close(code=4001)
            return
    # Note: token-less connections are allowed for backwards compatibility
    # (the dashboard passes a token; remove the 'if token' guard once fully rolled out)
    queue: asyncio.Queue = asyncio.Queue(maxsize=50)
    _subscribers.append(queue)
    logger.info("Notification WS connected. Subscribers: %d", len(_subscribers))

    # Send unread count on connect
    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter_by(slug="immoplus").first()
        unread = db.query(Notification).filter(
            Notification.tenant_id == tenant.id,
            Notification.is_read == False,  # noqa: E712
        ).count() if tenant else 0
        await websocket.send_text(json.dumps({"type": "init", "unread_count": unread}))
    except Exception:
        pass
    finally:
        try:
            db.close()
        except Exception:
            pass

    try:
        while True:
            # Wait for an event, but also keep the socket alive
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30)
                await websocket.send_text(json.dumps(event))
            except asyncio.TimeoutError:
                # Send keepalive ping
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("Notification WS error: %s", exc)
    finally:
        try:
            _subscribers.remove(queue)
        except ValueError:
            pass
        logger.info("Notification WS disconnected. Subscribers: %d", len(_subscribers))
