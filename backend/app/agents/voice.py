from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Any

from openai import OpenAI
from sqlalchemy.orm import Session

from app.agents.base import BaseAgent
from app.config import settings

logger = logging.getLogger(__name__)

_VOICE_SYSTEM = """Tu es l'assistante téléphonique de l'agence ImmoPlus à Lyon.
Tu réponds à des appels de prospects qui cherchent un bien immobilier.

Règles importantes :
- Réponds de façon concise (max 3 phrases) car c'est un appel téléphonique
- Parle naturellement, comme dans une vraie conversation
- Propose toujours d'envoyer les détails par email ou de fixer un rendez-vous
- Si tu ne connais pas la réponse, propose de transférer à un agent

Tu as accès aux biens disponibles via l'agent support si nécessaire."""


class VoiceAgent(BaseAgent):
    """
    Voice pipeline: STT (Whisper) → LLM (GPT-4o-mini) → TTS (OpenAI TTS-1).

    Designed for both:
    - Local browser demo  : /voice/chat (full audio round-trip)
    - Twilio production   : /voice/twilio/* (webhook + TwiML)
    """

    def __init__(self, tenant_id: str):
        super().__init__(tenant_id)
        self._client = OpenAI(api_key=settings.OPENAI_API_KEY)

    @property
    def agent_name(self) -> str:
        return "voice"

    # ── STT ───────────────────────────────────────────────────────────────────

    def transcribe(self, audio_bytes: bytes, filename: str = "audio.webm") -> str:
        """
        Transcribe audio bytes using OpenAI Whisper.
        Accepts any format supported by Whisper (webm, mp3, wav, ogg, m4a…).
        """
        suffix = Path(filename).suffix or ".webm"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = Path(tmp.name)

        try:
            with open(tmp_path, "rb") as f:
                resp = self._client.audio.transcriptions.create(
                    model="whisper-1",
                    file=f,
                    language="fr",
                )
            text = resp.text.strip()
            logger.info("Whisper transcription: %s", text[:100])
            return text
        finally:
            tmp_path.unlink(missing_ok=True)

    # ── LLM ───────────────────────────────────────────────────────────────────

    def respond(
        self,
        user_text: str,
        history: list[dict] | None = None,
        db: Session | None = None,
    ) -> str:
        """
        Generate a short voice-optimised response.
        Uses SupportAgent RAG when db is provided, otherwise falls back to
        a direct GPT-4o-mini call (for Twilio webhooks without a DB session).
        """
        if db is not None:
            # Full RAG pipeline via SupportAgent
            from app.agents.support import SupportAgent
            support = SupportAgent(tenant_id=self.tenant_id)
            result = support.run(
                {"message": user_text, "history": history or []},
                db,
            )
            response = result["response"]
        else:
            # Lightweight fallback (Twilio webhook — no DB in scope)
            messages = [{"role": "system", "content": _VOICE_SYSTEM}]
            if history:
                messages.extend(history)
            messages.append({"role": "user", "content": user_text})

            resp = self._client.chat.completions.create(
                model=settings.OPENAI_MODEL_MINI,
                messages=messages,
                temperature=0.7,
                max_tokens=200,
            )
            response = resp.choices[0].message.content.strip()

        logger.info("Voice response: %s", response[:100])
        return response

    # ── TTS ───────────────────────────────────────────────────────────────────

    def synthesize(self, text: str, voice: str = "alloy") -> bytes:
        """
        Convert text to speech using OpenAI TTS-1.
        Returns MP3 bytes.

        Available voices: alloy, echo, fable, onyx, nova, shimmer
        """
        resp = self._client.audio.speech.create(
            model="tts-1",
            voice=voice,
            input=text,
            response_format="mp3",
        )
        audio_bytes = resp.read()
        logger.info("TTS synthesized %d bytes for %d chars", len(audio_bytes), len(text))
        return audio_bytes

    # ── Full pipeline ─────────────────────────────────────────────────────────

    def run(self, input_data: dict[str, Any], db: Session) -> dict[str, Any]:
        """Full voice round-trip: audio bytes → transcription → response → audio bytes."""
        audio_bytes: bytes = input_data["audio_bytes"]
        filename: str = input_data.get("filename", "audio.webm")
        history: list[dict] = input_data.get("history", [])

        transcript = self.transcribe(audio_bytes, filename)
        response_text = self.respond(transcript, history=history, db=db)
        response_audio = self.synthesize(response_text)

        return {
            "transcript": transcript,
            "response_text": response_text,
            "response_audio": response_audio,
        }
