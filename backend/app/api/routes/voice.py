from __future__ import annotations

import asyncio
import logging
import os
import threading
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

# In-memory task store for two-phase Twilio responses
# task_id -> {"status": "pending"|"done", "text": str, "filename": str|None}
_TASKS: dict[str, dict] = {}


def _openai_tts(text: str) -> str | None:
    """Generate speech with OpenAI TTS (nova). Returns filename or None on failure."""
    if not settings.OPENAI_API_KEY:
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
        filename = f"{uuid.uuid4().hex}.mp3"
        path = os.path.join(_TTS_DIR, filename)
        with open(path, "wb") as f:
            f.write(response.content)
        logger.info("OpenAI TTS: %d bytes → %s", len(response.content), filename)
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


def _run_voice_task(task_id: str, speech_result: str) -> None:
    """Background thread: LLM response + OpenAI TTS. Stores result in _TASKS."""
    from app.database.connection import SessionLocal
    from app.agents.voice import VoiceAgent

    response_text = None

    # Attempt 1: full RAG pipeline (SupportAgent — property search + embeddings)
    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter_by(slug="immoplus").first()
        tenant_id = str(tenant.id) if tenant else "unknown"
        agent = VoiceAgent(tenant_id=tenant_id)
        response_text = agent.respond(speech_result, history=[], db=db)
        logger.info("Voice task %s: RAG response OK", task_id)
    except Exception as exc:
        logger.warning("Voice task %s: RAG pipeline failed (%s) — trying direct LLM", task_id, exc)
    finally:
        db.close()

    # Attempt 2: direct GPT-4o-mini without RAG (db=None)
    if response_text is None:
        try:
            db2 = SessionLocal()
            try:
                tenant = db2.query(Tenant).filter_by(slug="immoplus").first()
                tenant_id = str(tenant.id) if tenant else "unknown"
            finally:
                db2.close()
            agent = VoiceAgent(tenant_id=tenant_id)
            response_text = agent.respond(speech_result, history=[], db=None)
            logger.info("Voice task %s: direct LLM response OK", task_id)
        except Exception as exc2:
            logger.error("Voice task %s: direct LLM also failed: %s", task_id, exc2, exc_info=True)
            response_text = (
                "Je suis désolée, je rencontre des difficultés techniques. "
                "Pouvez-vous rappeler dans quelques instants ou nous écrire par email ?"
            )

    clean_text = _tts_preprocess(response_text)
    filename = _openai_tts(clean_text)
    _TASKS[task_id] = {"status": "done", "text": clean_text, "filename": filename}
    logger.info("Voice task %s done (filename=%s)", task_id, filename)


MAX_AUDIO_SIZE = 25 * 1024 * 1024


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

    info = {
        "openai_key_set": bool(settings.OPENAI_API_KEY),
        "public_url": settings.PUBLIC_URL,
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
        filename = f"{uuid.uuid4().hex}.mp3"
        with open(os.path.join(_TTS_DIR, filename), "wb") as f:
            f.write(response.content)
        info["audio_bytes"] = len(response.content)
    except Exception as e:
        return {"ok": False, "error": str(e), "traceback": traceback.format_exc(), "info": info}

    audio_url = f"{settings.PUBLIC_URL.rstrip('/')}/voice/audio/{filename}"
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
    resp.say("Merci d'avoir appelé ImmoPlus. Au revoir !", language="fr-FR", voice="Polly.Lea")

    return Response(content=str(resp), media_type="application/xml")


@router.post(
    "/twilio/gather",
    summary="Twilio webhook — captures speech, starts background processing",
    response_class=Response,
)
async def twilio_gather(request: Request):
    """
    Phase 1: immediately respond to Twilio with a hold message while
    LLM + TTS runs in a background thread. Redirects to /twilio/respond/{id}.
    """
    from twilio.twiml.voice_response import VoiceResponse

    form = await request.form()
    speech_result = form.get("SpeechResult", "").strip()

    resp = VoiceResponse()

    if not speech_result:
        from twilio.twiml.voice_response import Gather
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

    # Start LLM + TTS in background thread
    task_id = uuid.uuid4().hex
    _TASKS[task_id] = {"status": "pending"}
    thread = threading.Thread(target=_run_voice_task, args=(task_id, speech_result), daemon=True)
    thread.start()

    # Immediately respond: say hold message, then redirect to phase 2
    base_url = settings.PUBLIC_URL.rstrip("/")
    resp.say("Un instant, je cherche la réponse pour vous.", language="fr-FR", voice="Polly.Lea")
    resp.redirect(f"{base_url}/voice/twilio/respond/{task_id}", method="POST")

    return Response(content=str(resp), media_type="application/xml")


@router.post(
    "/twilio/respond/{task_id}",
    summary="Twilio webhook — phase 2: returns the generated OpenAI TTS response",
    response_class=Response,
)
async def twilio_respond(task_id: str, request: Request):
    """
    Phase 2: waits for the background task to finish (up to 12s),
    then returns TwiML with the OpenAI TTS audio.
    """
    from twilio.twiml.voice_response import VoiceResponse, Gather

    # Poll until task is done (max 12s — stays under Twilio's 15s timeout)
    for _ in range(120):
        task = _TASKS.get(task_id)
        if task and task["status"] == "done":
            break
        await asyncio.sleep(0.1)

    task = _TASKS.pop(task_id, None)
    base_url = settings.PUBLIC_URL.rstrip("/")

    resp = VoiceResponse()
    gather = Gather(
        input="speech",
        action="/voice/twilio/gather",
        method="POST",
        language="fr-FR",
        speech_timeout="auto",
    )

    if task and task.get("filename"):
        gather.play(f"{base_url}/voice/audio/{task['filename']}")
    elif task and task.get("text"):
        gather.say(task["text"], language="fr-FR", voice="Polly.Lea")
    else:
        gather.say(
            "Désolé, je n'ai pas pu traiter votre demande. Pouvez-vous rappeler ?",
            language="fr-FR",
            voice="Polly.Lea",
        )

    resp.append(gather)
    resp.say("Merci d'avoir appelé ImmoPlus. Au revoir !", language="fr-FR", voice="Polly.Lea")

    return Response(content=str(resp), media_type="application/xml")
