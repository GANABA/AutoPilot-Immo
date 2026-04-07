from __future__ import annotations

import asyncio
import logging

from urllib.parse import quote, unquote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.dependencies import get_db
from app.database.models import Tenant

logger = logging.getLogger(__name__)
router = APIRouter()


def _tts_preprocess(text: str) -> str:
    """Make text more natural for Polly TTS: expand units, format numbers."""
    import re

    # Currency — before number formatting
    text = re.sub(r"(\d[\d\s]*)\s*€", lambda m: m.group(1).replace(" ", "") + " euros", text)
    text = re.sub(r"€\s*(\d[\d\s]*)", lambda m: m.group(1).replace(" ", "") + " euros", text)

    # Surface units
    text = text.replace("m²", " mètres carrés")
    text = text.replace("m2", " mètres carrés")

    # Percent
    text = text.replace("%", " pourcent")

    # Format large numbers with spaces for readability (e.g. 285000 → 285 000)
    def format_number(m):
        n = m.group(0)
        # insert spaces every 3 digits from right
        result = ""
        for i, c in enumerate(reversed(n)):
            if i > 0 and i % 3 == 0:
                result = " " + result
            result = c + result
        return result

    text = re.sub(r"\b\d{4,}\b", format_number, text)

    # Common abbreviations
    text = text.replace("T1", "T un").replace("T2", "T deux").replace("T3", "T trois")
    text = text.replace("T4", "T quatre").replace("T5", "T cinq")
    text = text.replace("DPE", "D P E")

    # Remove markdown symbols that Polly would read
    text = re.sub(r"\*+", "", text)
    text = re.sub(r"#+\s*", "", text)
    text = text.replace("_", " ")

    return text.strip()

MAX_AUDIO_SIZE = 25 * 1024 * 1024  # 25 MB (Whisper limit)


def _get_tenant(db: Session) -> Tenant:
    tenant = db.query(Tenant).filter_by(slug="immoplus").first()
    if not tenant:
        raise HTTPException(status_code=500, detail="Tenant not configured.")
    return tenant


# ── Local browser demo ────────────────────────────────────────────────────────

@router.post(
    "/chat",
    summary="Voice round-trip for local demo (audio → Whisper → LLM → TTS → audio)",
    responses={200: {"content": {"audio/mpeg": {}}}},
)
async def voice_chat(
    file: UploadFile = File(..., description="Audio recording (webm, mp3, wav, ogg)"),
    db: Session = Depends(get_db),
):
    """
    Accepts a browser audio recording, returns MP3 audio response.

    Headers in response:
    - X-Transcript   : what Whisper heard
    - X-Response-Text: what the agent replied
    """
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
            {
                "audio_bytes": content,
                "filename": file.filename or "audio.webm",
                "history": [],
            },
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


# ── Twilio webhooks (production) ──────────────────────────────────────────────

@router.post(
    "/twilio/incoming",
    summary="Twilio webhook — incoming call entry point",
    response_class=Response,
)
async def twilio_incoming(request: Request):
    """
    Called by Twilio when a call arrives on the ImmoPlus number.
    Returns TwiML that greets the caller and gathers their speech.
    """
    from twilio.twiml.voice_response import VoiceResponse, Gather

    tenant_db: Session = next(
        iter(request.app.state.__dict__.get("_db_sessions", [])), None
    )

    resp = VoiceResponse()
    gather = Gather(
        input="speech",
        action="/voice/twilio/gather",
        method="POST",
        language="fr-FR",
        speech_timeout="auto",
        enhanced=True,
    )
    gather.say(
        "Bonjour, bienvenue chez ImmoPlus. "
        "Comment puis-je vous aider dans votre recherche immobilière ?",
        language="fr-FR",
        voice="Polly.Lea",
    )
    resp.append(gather)
    resp.say("Je n'ai pas entendu votre réponse. Au revoir.", language="fr-FR")

    return Response(content=str(resp), media_type="application/xml")


@router.post(
    "/twilio/gather",
    summary="Twilio webhook — processes caller speech and responds",
    response_class=Response,
)
async def twilio_gather(request: Request):
    """
    Called by Twilio after gathering caller speech.
    Runs VoiceAgent and returns TwiML with the spoken response.
    """
    from twilio.twiml.voice_response import VoiceResponse, Gather
    from app.agents.voice import VoiceAgent
    from app.database.connection import SessionLocal

    form = await request.form()
    speech_result = form.get("SpeechResult", "").strip()

    resp = VoiceResponse()

    if not speech_result:
        resp.say(
            "Je n'ai pas compris. Pouvez-vous répéter ?",
            language="fr-FR",
            voice="Polly.Lea",
        )
        gather = Gather(
            input="speech",
            action="/voice/twilio/gather",
            method="POST",
            language="fr-FR",
            speech_timeout="auto",
        )
        resp.append(gather)
        return Response(content=str(resp), media_type="application/xml")

    # Run VoiceAgent without DB (lightweight fallback)
    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter_by(slug="immoplus").first()
        tenant_id = str(tenant.id) if tenant else "unknown"

        agent = VoiceAgent(tenant_id=tenant_id)
        response_text = await asyncio.to_thread(
            agent.respond,
            speech_result,
            history=[],
            db=db,
        )
    except Exception as exc:
        logger.error("Twilio VoiceAgent error: %s", exc)
        response_text = "Désolé, une erreur s'est produite. Veuillez rappeler ou contacter l'agence par email."
    finally:
        db.close()

    # Respond and gather next turn
    gather = Gather(
        input="speech",
        action="/voice/twilio/gather",
        method="POST",
        language="fr-FR",
        speech_timeout="auto",
    )
    gather.say(_tts_preprocess(response_text), language="fr-FR", voice="Polly.Lea")
    resp.append(gather)
    resp.say("Merci d'avoir appelé ImmoPlus. Au revoir !", language="fr-FR")

    return Response(content=str(resp), media_type="application/xml")
