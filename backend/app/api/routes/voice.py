from __future__ import annotations

import asyncio
import logging
import os
import uuid

from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.api.dependencies import get_db
from app.config import settings
from app.database.models import Tenant

logger = logging.getLogger(__name__)
router = APIRouter()

# Temp dir for TTS audio files served to Twilio
_TTS_DIR = "/tmp/ap_tts"
os.makedirs(_TTS_DIR, exist_ok=True)


def _openai_tts(text: str) -> str | None:
    """
    Generate speech with OpenAI TTS and save to a temp MP3 file.
    Returns the filename, or None on failure.
    Voice: 'nova' (warm, natural French) — model: tts-1 (fast, low latency).
    """
    if not settings.OPENAI_API_KEY:
        logger.warning("OpenAI TTS: OPENAI_API_KEY not set — falling back to Polly")
        return None
    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        response = client.audio.speech.create(
            model="tts-1",
            voice="nova",
            input=text,
            response_format="mp3",
        )
        audio_bytes = response.content
        filename = f"{uuid.uuid4().hex}.mp3"
        path = os.path.join(_TTS_DIR, filename)
        with open(path, "wb") as f:
            f.write(audio_bytes)
        logger.info("OpenAI TTS: saved %d bytes → %s", len(audio_bytes), filename)
        return filename
    except Exception as exc:
        logger.error("OpenAI TTS error: %s", exc, exc_info=True)
        return None


def _tts_preprocess(text: str) -> str:
    """Expand symbols so TTS reads them naturally."""
    import re

    text = re.sub(r"(\d[\d\s]*)\s*€", lambda m: m.group(1).replace(" ", "") + " euros", text)
    text = re.sub(r"€\s*(\d[\d\s]*)", lambda m: m.group(1).replace(" ", "") + " euros", text)
    text = text.replace("m²", " mètres carrés").replace("m2", " mètres carrés")
    text = text.replace("%", " pourcent")

    def format_number(m):
        n, result = m.group(0), ""
        for i, c in enumerate(reversed(n)):
            if i > 0 and i % 3 == 0:
                result = " " + result
            result = c + result
        return result

    text = re.sub(r"\b\d{4,}\b", format_number, text)
    text = text.replace("T1", "T un").replace("T2", "T deux").replace("T3", "T trois")
    text = text.replace("T4", "T quatre").replace("T5", "T cinq")
    text = text.replace("DPE", "D P E")
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


# ── TTS diagnostic endpoint ───────────────────────────────────────────────────

@router.get("/test-tts", tags=["voice"])
async def test_tts():
    """Quick diagnostic: generates a test audio file with OpenAI TTS."""
    import traceback

    public_url = settings.PUBLIC_URL
    info = {
        "openai_key_set": bool(settings.OPENAI_API_KEY),
        "public_url": public_url,
        "tts_dir_exists": os.path.isdir(_TTS_DIR),
    }

    if not settings.OPENAI_API_KEY:
        return {"ok": False, "error": "OPENAI_API_KEY not set", "info": info}

    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        response = client.audio.speech.create(
            model="tts-1",
            voice="nova",
            input="Bonjour, je suis l'assistante ImmoPlus. Comment puis-je vous aider ?",
            response_format="mp3",
        )
        audio_bytes = response.content
        info["audio_bytes"] = len(audio_bytes)
        filename = f"{uuid.uuid4().hex}.mp3"
        with open(os.path.join(_TTS_DIR, filename), "wb") as f:
            f.write(audio_bytes)
    except Exception as e:
        return {"ok": False, "error": str(e), "traceback": traceback.format_exc(), "info": info}

    audio_url = f"{public_url.rstrip('/')}/voice/audio/{filename}"
    return {"ok": True, "audio_url": audio_url, "info": info}


# ── TTS audio file endpoint ───────────────────────────────────────────────────

@router.get("/audio/{filename}", include_in_schema=False)
async def serve_tts_audio(filename: str):
    """Serve a generated TTS file to Twilio's <Play> verb."""
    path = os.path.join(_TTS_DIR, filename)
    if not os.path.exists(path) or ".." in filename:
        raise HTTPException(status_code=404)
    return FileResponse(path, media_type="audio/mpeg")


# ── Twilio webhooks (production) ──────────────────────────────────────────────

@router.post(
    "/twilio/incoming",
    summary="Twilio webhook — incoming call entry point",
    response_class=Response,
)
async def twilio_incoming(request: Request):
    from twilio.twiml.voice_response import VoiceResponse, Gather

    greeting = (
        "Bonjour, bienvenue chez ImmoPlus. "
        "Comment puis-je vous aider dans votre recherche immobilière ?"
    )

    base_url = settings.PUBLIC_URL.rstrip("/")
    resp = VoiceResponse()
    gather = Gather(
        input="speech",
        action="/voice/twilio/gather",
        method="POST",
        language="fr-FR",
        speech_timeout="auto",
    )

    tts_file = await asyncio.to_thread(_openai_tts, greeting)
    if tts_file:
        gather.play(f"{base_url}/voice/audio/{tts_file}")
    else:
        gather.say(greeting, language="fr-FR", voice="Polly.Lea")

    resp.append(gather)

    # Retry once before hanging up
    retry_gather = Gather(
        input="speech",
        action="/voice/twilio/gather",
        method="POST",
        language="fr-FR",
        speech_timeout="auto",
    )
    retry_gather.say(
        "Je n'ai pas entendu votre réponse. Pouvez-vous répéter votre demande ?",
        language="fr-FR",
        voice="Polly.Lea",
    )
    resp.append(retry_gather)
    resp.say("Merci d'avoir appelé ImmoPlus. Au revoir !", language="fr-FR")

    return Response(content=str(resp), media_type="application/xml")


@router.post(
    "/twilio/gather",
    summary="Twilio webhook — processes caller speech and responds",
    response_class=Response,
)
async def twilio_gather(request: Request):
    from twilio.twiml.voice_response import VoiceResponse, Gather
    from app.agents.voice import VoiceAgent
    from app.database.connection import SessionLocal

    form = await request.form()
    speech_result = form.get("SpeechResult", "").strip()

    resp = VoiceResponse()

    if not speech_result:
        gather = Gather(
            input="speech",
            action="/voice/twilio/gather",
            method="POST",
            language="fr-FR",
            speech_timeout="auto",
        )
        gather.say("Je n'ai pas compris. Pouvez-vous répéter ?", language="fr-FR", voice="Polly.Lea")
        resp.append(gather)
        return Response(content=str(resp), media_type="application/xml")

    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter_by(slug="immoplus").first()
        tenant_id = str(tenant.id) if tenant else "unknown"
        agent = VoiceAgent(tenant_id=tenant_id)
        response_text = await asyncio.wait_for(
            asyncio.to_thread(agent.respond, speech_result, history=[], db=db),
            timeout=10.0,
        )
    except asyncio.TimeoutError:
        logger.error("Twilio VoiceAgent timed out after 10s")
        response_text = "Je mets un peu de temps à répondre. Pouvez-vous reformuler votre demande ?"
    except Exception as exc:
        logger.error("Twilio VoiceAgent error: %s", exc)
        response_text = "Désolé, une erreur s'est produite. Veuillez rappeler ou contacter l'agence par email."
    finally:
        db.close()

    # Use Polly directly — avoids extra TTS API call and keeps response under Twilio's 15s timeout
    clean_text = _tts_preprocess(response_text)
    gather = Gather(
        input="speech",
        action="/voice/twilio/gather",
        method="POST",
        language="fr-FR",
        speech_timeout="auto",
    )
    gather.say(clean_text, language="fr-FR", voice="Polly.Lea")

    resp.append(gather)
    resp.say("Merci d'avoir appelé ImmoPlus. Au revoir !", language="fr-FR", voice="Polly.Lea")

    return Response(content=str(resp), media_type="application/xml")
