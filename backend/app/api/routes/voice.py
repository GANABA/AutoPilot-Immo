"""
Voice endpoints — AutoPilot Immo

Two modes:
1. Local browser demo  : POST /voice/chat  (audio → Whisper → SupportAgent → TTS → audio)
2. Vapi production     : POST /voice/vapi/chat    (custom LLM endpoint)
                         POST /voice/vapi/events  (server messages webhook)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.api.dependencies import get_db
from app.api.utils import sanitize_user_input
from app.config import settings
from app.database.connection import SessionLocal
from app.database.models import Conversation, Message, Tenant

logger = logging.getLogger(__name__)
router = APIRouter()

# ── TTS cache dir (local demo) ────────────────────────────────────────────────
_TTS_DIR = "/tmp/ap_tts"
os.makedirs(_TTS_DIR, exist_ok=True)

# ── In-memory voice sessions (Vapi — one entry per active call) ───────────────
# call_id → {conversation_id, tenant_id, slots, contact_captured}
_VOICE_SESSIONS: dict[str, dict] = {}

MAX_AUDIO_SIZE = 25 * 1024 * 1024


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_tenant(db: Session) -> Tenant:
    tenant = db.query(Tenant).filter_by(slug="immoplus").first()
    if not tenant:
        raise HTTPException(status_code=500, detail="Tenant not configured.")
    return tenant


def _tts_preprocess(text: str) -> str:
    """Expand symbols so TTS reads them naturally."""
    import re
    text = re.sub(r"(\d[\d\s]*)\s*€", lambda m: m.group(1).replace(" ", "") + " euros", text)
    text = re.sub(r"€\s*(\d[\d\s]*)", lambda m: m.group(1).replace(" ", "") + " euros", text)
    text = text.replace("m²", " mètres carrés").replace("m2", " mètres carrés")
    text = text.replace("%", " pourcent")

    def _fmt(m):
        n, res = m.group(0), ""
        for i, c in enumerate(reversed(n)):
            if i > 0 and i % 3 == 0:
                res = " " + res
            res = c + res
        return res

    text = re.sub(r"\b\d{4,}\b", _fmt, text)
    for old, new in [("T1","T un"),("T2","T deux"),("T3","T trois"),("T4","T quatre"),("T5","T cinq"),("DPE","D P E")]:
        text = text.replace(old, new)
    text = re.sub(r"\*+", "", text)
    text = re.sub(r"#+\s*", "", text)
    return text.replace("_", " ").strip()


def _openai_tts(text: str) -> str | None:
    """Generate speech with OpenAI TTS. Returns filename or None."""
    if not settings.OPENAI_API_KEY:
        return None
    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        resp = client.audio.speech.create(model="tts-1", voice="nova", input=text, response_format="mp3")
        filename = f"{uuid.uuid4().hex}.mp3"
        with open(os.path.join(_TTS_DIR, filename), "wb") as f:
            f.write(resp.content)
        return filename
    except Exception as exc:
        logger.error("OpenAI TTS error: %s", exc)
        return None


def _openai_chat_response(content: str) -> dict:
    """Build an OpenAI-compatible chat completion response."""
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion",
        "created": int(datetime.now(timezone.utc).timestamp()),
        "model": settings.OPENAI_MODEL_MINI,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": content},
            "finish_reason": "stop",
        }],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


def _verify_vapi_secret(request: Request) -> None:
    """Validate x-vapi-secret header if VAPI_WEBHOOK_SECRET is configured."""
    secret = settings.VAPI_WEBHOOK_SECRET
    if not secret:
        return  # no validation configured
    header = request.headers.get("x-vapi-secret", "")
    if header != secret:
        raise HTTPException(status_code=401, detail="Invalid Vapi webhook secret.")


# Import working hours helpers from chat route (avoid code duplication)
def _is_within_working_hours(tenant_settings: dict) -> bool:
    from app.api.routes.chat import _is_within_working_hours as _wh
    return _wh(tenant_settings)


def _out_of_hours_message(tenant_settings: dict) -> str:
    from app.api.routes.chat import _out_of_hours_message as _ooh
    return _ooh(tenant_settings)


# ── Local browser demo ────────────────────────────────────────────────────────

@router.post(
    "/chat",
    summary="Voice round-trip for local demo (audio → Whisper → SupportAgent → TTS → audio)",
    responses={200: {"content": {"audio/mpeg": {}}}},
)
async def voice_chat(
    file: UploadFile = File(..., description="Audio recording (webm, mp3, wav, ogg)"),
    db: Session = Depends(get_db),
):
    from urllib.parse import quote
    from app.agents.voice import VoiceAgent

    content = await file.read()
    if len(content) > MAX_AUDIO_SIZE:
        raise HTTPException(status_code=413, detail="Audio file exceeds 25 MB.")
    if len(content) < 100:
        raise HTTPException(status_code=422, detail="Audio file is too short or empty.")

    tenant = _get_tenant(db)
    agent = VoiceAgent(tenant_id=str(tenant.id))

    try:
        result = await asyncio.to_thread(
            agent.run,
            {"audio_bytes": content, "filename": file.filename or "audio.webm", "history": []},
            db,
        )
    except Exception as exc:
        logger.error("VoiceAgent error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Voice pipeline error: {exc}")

    return Response(
        content=result["response_audio"],
        media_type="audio/mpeg",
        headers={
            "X-Transcript": quote(result["transcript"]),
            "X-Response-Text": quote(result["response_text"]),
            "Access-Control-Expose-Headers": "X-Transcript, X-Response-Text",
        },
    )


# ── TTS audio file (for /test-tts diagnostic) ─────────────────────────────────

@router.get("/audio/{filename}", include_in_schema=False)
async def serve_tts_audio(filename: str):
    path = os.path.join(_TTS_DIR, filename)
    if not os.path.exists(path) or ".." in filename:
        raise HTTPException(status_code=404)
    return FileResponse(path, media_type="audio/mpeg")


@router.get("/test-tts", tags=["voice"])
async def test_tts():
    """Quick diagnostic: generate a test audio file with OpenAI TTS."""
    info = {"openai_key_set": bool(settings.OPENAI_API_KEY), "tts_dir": _TTS_DIR}
    if not settings.OPENAI_API_KEY:
        return {"ok": False, "error": "OPENAI_API_KEY not set", "info": info}
    try:
        filename = _openai_tts("Bonjour, je suis l'assistante ImmoPlus. Comment puis-je vous aider ?")
        info["audio_bytes_generated"] = bool(filename)
    except Exception as e:
        return {"ok": False, "error": str(e), "info": info}
    audio_url = f"{settings.PUBLIC_URL.rstrip('/')}/voice/audio/{filename}" if filename else None
    return {"ok": True, "audio_url": audio_url, "info": info}


# ── Vapi — Custom LLM endpoint ────────────────────────────────────────────────
# Vapi appends /chat/completions to whatever URL you configure.
# → Set Custom LLM URL to: https://your-domain.com/voice/vapi
# → Vapi will call:        https://your-domain.com/voice/vapi/chat/completions  ✓
#
# The /vapi/chat alias below keeps backward-compat if the old URL was already saved.

@router.get("/vapi", include_in_schema=False)
async def vapi_health():
    """Vapi calls GET on the Custom LLM URL to verify it's reachable."""
    return {"ok": True, "service": "AutoPilot Immo — Vapi Custom LLM"}

@router.post(
    "/vapi/chat/completions",
    summary="Vapi custom LLM endpoint (OpenAI-compatible /chat/completions)",
)
async def vapi_chat_completions(request: Request, db: Session = Depends(get_db)):
    """
    Main Vapi endpoint. Configure in Vapi dashboard:
      Assistant → Model → Custom LLM → URL: https://your-domain.com/voice/vapi
    Vapi appends /chat/completions automatically.
    """
    return await _vapi_chat_handler(request, db)


@router.post(
    "/vapi/chat",
    include_in_schema=False,  # legacy alias — keep in case old URL is saved
)
async def vapi_chat(request: Request, db: Session = Depends(get_db)):
    return await _vapi_chat_handler(request, db)


async def _vapi_chat_handler(request: Request, db: Session):
    _verify_vapi_secret(request)

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid JSON body.")

    call = body.get("call") or {}
    call_id = call.get("id") or f"unknown-{uuid.uuid4().hex[:8]}"
    messages: list[dict] = body.get("messages") or []
    customer = call.get("customer") or {}
    prospect_phone = customer.get("number") or ""

    tenant = _get_tenant(db)
    tenant_settings = tenant.settings or {}

    # ── Working hours check ───────────────────────────────────────────────────
    if not _is_within_working_hours(tenant_settings):
        voice_cfg = tenant_settings.get("voice", {})
        ooh_msg = voice_cfg.get("out_of_hours_message") or _out_of_hours_message(tenant_settings)
        return _openai_chat_response(_tts_preprocess(ooh_msg))

    # ── Session init (first turn of this call) ────────────────────────────────
    if call_id not in _VOICE_SESSIONS:
        # Check if we know this phone number (returning prospect)
        contact_captured = False
        prospect_name = None
        prospect_email = None
        if prospect_phone:
            known = (
                db.query(Conversation)
                .filter(
                    Conversation.tenant_id == tenant.id,
                    Conversation.prospect_phone == prospect_phone,
                    Conversation.prospect_email.isnot(None),
                )
                .order_by(Conversation.created_at.desc())
                .first()
            )
            if known:
                contact_captured = True
                prospect_name = known.prospect_name
                prospect_email = known.prospect_email
                logger.info("Vapi: returning prospect %s (%s)", prospect_name, prospect_phone)

        # Create a new Conversation for this call
        conv = Conversation(
            tenant_id=tenant.id,
            channel="phone",
            prospect_phone=prospect_phone or None,
            prospect_name=prospect_name,
            prospect_email=prospect_email,
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)

        _VOICE_SESSIONS[call_id] = {
            "conversation_id": str(conv.id),
            "tenant_id": str(tenant.id),
            "slots": [],
            "contact_captured": contact_captured,
        }
        logger.info("Vapi: new call %s → conv %s (phone=%s)", call_id, conv.id, prospect_phone or "—")

    session = _VOICE_SESSIONS[call_id]

    # ── Extract last user message and build history ───────────────────────────
    # Vapi sends all messages including system — we only pass user/assistant to the agent
    chat_messages = [m for m in messages if m.get("role") in ("user", "assistant")]
    last_user_msg = ""
    for m in reversed(chat_messages):
        if m["role"] == "user":
            last_user_msg = sanitize_user_input(m.get("content") or "")
            break
    history = chat_messages[:-1] if chat_messages else []  # everything before last user turn

    if not last_user_msg:
        voice_cfg = tenant_settings.get("voice", {})
        greeting = voice_cfg.get("greeting") or "Bonjour, comment puis-je vous aider ?"
        return _openai_chat_response(_tts_preprocess(greeting))

    # ── Run SupportAgent ──────────────────────────────────────────────────────
    from app.agents.support import SupportAgent
    agent = SupportAgent(tenant_id=session["tenant_id"])

    try:
        result = await asyncio.to_thread(
            agent.run,
            {
                "message": last_user_msg,
                "history": history,
                "available_slots": session["slots"],
                "contact_captured": session["contact_captured"],
                "tenant_settings": tenant_settings,
            },
            db,
        )
    except Exception as exc:
        logger.error("Vapi SupportAgent error: %s", exc, exc_info=True)
        return _openai_chat_response(
            "Je suis désolée, je rencontre un problème technique. Pouvez-vous reformuler ?"
        )

    response_text = result.get("response") or ""

    # ── Persist turn to DB ────────────────────────────────────────────────────
    conv = db.query(Conversation).filter_by(id=session["conversation_id"]).first()
    if conv:
        db.add(Message(conversation_id=conv.id, role="user",      content=last_user_msg))
        db.add(Message(conversation_id=conv.id, role="assistant", content=response_text))

        # Update contact info if detected this turn
        if result.get("detected_email") and not conv.prospect_email:
            conv.prospect_email = result["detected_email"]
            session["contact_captured"] = True
            logger.info("Vapi: email captured %s", result["detected_email"])
        if result.get("detected_name") and not conv.prospect_name:
            conv.prospect_name = result["detected_name"]
        if result.get("criteria"):
            conv.search_criteria = result["criteria"]

        # Advance status
        if result.get("booked_slot") and conv.status != "visit_booked":
            conv.status = "visit_booked"
        elif conv.prospect_email and conv.status == "open":
            conv.status = "qualified"

        db.commit()

    # Update in-memory session
    if result.get("available_slots"):
        session["slots"] = result["available_slots"]

    # ── Check for transfer request ────────────────────────────────────────────
    # If LLM decides to transfer (detected keyword in response), log it
    transfer_keywords = ("transférer", "transfert", "agent humain", "conseiller")
    if any(kw in response_text.lower() for kw in transfer_keywords):
        logger.info("Vapi: transfer hint detected in response for call %s", call_id)

    clean_text = _tts_preprocess(response_text)
    return _openai_chat_response(clean_text)


# ── Vapi — Server messages webhook ───────────────────────────────────────────

@router.post(
    "/vapi/events",
    summary="Vapi server messages — call lifecycle events",
)
async def vapi_events(request: Request):
    """
    Handles Vapi server messages:
    - call-started           : log call start
    - end-of-call-report     : save transcript + auto-summary to DB
    - transfer-destination-request : return transfer number from settings
    - status-update          : log status changes

    Configure in Vapi dashboard:
      Assistant → Server URL: https://your-domain.com/voice/vapi/events
    """
    _verify_vapi_secret(request)

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid JSON body.")

    message = body.get("message") or {}
    msg_type = message.get("type") or ""
    call = message.get("call") or {}
    call_id = call.get("id") or ""

    logger.info("Vapi event: %s (call=%s)", msg_type, call_id)

    # ── call-started ──────────────────────────────────────────────────────────
    if msg_type == "call-started":
        logger.info("Vapi call started: %s", call_id)
        return {"received": True}

    # ── end-of-call-report ────────────────────────────────────────────────────
    if msg_type == "end-of-call-report":
        transcript   = message.get("transcript") or ""
        duration_sec = message.get("durationSeconds") or 0
        ended_reason = message.get("endedReason") or ""
        vapi_summary = message.get("summary") or ""

        session = _VOICE_SESSIONS.pop(call_id, None)
        if not session:
            logger.warning("Vapi end-of-call: no session found for call %s", call_id)
            return {"received": True}

        db = SessionLocal()
        try:
            conv = db.query(Conversation).filter_by(id=session["conversation_id"]).first()
            if not conv:
                return {"received": True}

            # Auto-generate a French GPT summary if not provided by Vapi
            summary = vapi_summary
            if not summary and transcript:
                summary = _generate_call_summary(transcript, duration_sec)

            # Save call metadata as a system message
            meta = {
                "call_id": call_id,
                "duration_seconds": duration_sec,
                "ended_reason": ended_reason,
                "summary": summary,
                "transcript_length": len(transcript),
            }
            db.add(Message(
                conversation_id=conv.id,
                role="system",
                content=f"CALL_REPORT:{json.dumps(meta, ensure_ascii=False)}",
            ))

            # Save full transcript as a system message
            if transcript:
                db.add(Message(
                    conversation_id=conv.id,
                    role="system",
                    content=f"TRANSCRIPT:{transcript[:4000]}",
                ))

            # Save summary + duration on conversation
            conv.call_summary = summary
            conv.call_duration_sec = duration_sec

            # Close conversation if call ended normally
            if ended_reason in ("customer-ended-call", "assistant-ended-call"):
                if conv.status == "open":
                    conv.status = "closed"

            db.commit()
            logger.info(
                "Vapi call %s saved — %ds, reason=%s, conv=%s",
                call_id, duration_sec, ended_reason, conv.id,
            )

            # Notification — new call ended
            try:
                from app.api.routes.notifications import create_notification
                caller = conv.prospect_name or conv.prospect_phone or "Inconnu"
                mins = duration_sec // 60
                secs = duration_sec % 60
                create_notification(
                    db, conv.tenant_id,
                    "new_call",
                    f"Appel terminé : {caller}",
                    f"Durée : {mins}m{secs:02d}s" + (f" · {summary[:80]}" if summary else ""),
                    {"conversation_id": str(conv.id)},
                )
            except Exception:
                pass
        except Exception as exc:
            logger.error("Vapi end-of-call DB save failed: %s", exc, exc_info=True)
            db.rollback()
        finally:
            db.close()

        return {"received": True}

    # ── transfer-destination-request ──────────────────────────────────────────
    if msg_type == "transfer-destination-request":
        db = SessionLocal()
        try:
            tenant = db.query(Tenant).filter_by(slug="immoplus").first()
            transfer_number = (tenant.settings or {}).get("voice", {}).get("transfer_number")
        finally:
            db.close()

        if transfer_number:
            logger.info("Vapi: transferring call %s to %s", call_id, transfer_number)
            return {
                "destination": {
                    "type": "number",
                    "number": transfer_number,
                    "message": "Je vous transfère à l'un de nos conseillers. Patientez quelques instants.",
                }
            }
        else:
            logger.warning("Vapi: transfer requested but no transfer_number configured")
            return {"error": "No transfer number configured"}

    # ── status-update / other ─────────────────────────────────────────────────
    return {"received": True}


def _generate_call_summary(transcript: str, duration_sec: int) -> str:
    """Generate a short French call summary using GPT-4o-mini."""
    if not settings.OPENAI_API_KEY:
        return ""
    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        minutes = duration_sec // 60
        resp = client.chat.completions.create(
            model=settings.OPENAI_MODEL_MINI,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Tu es un assistant qui résume des appels immobiliers en 2-3 phrases en français. "
                        "Mentionne : ce que cherchait le prospect, si des biens ont été proposés, "
                        "si un RDV a été pris, et le résultat de l'appel."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Durée : {minutes} min.\n\nTranscript :\n{transcript[:3000]}",
                },
            ],
            temperature=0.3,
            max_tokens=200,
        )
        return resp.choices[0].message.content.strip()
    except Exception as exc:
        logger.warning("Call summary generation failed: %s", exc)
        return ""
