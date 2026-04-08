from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env from project root regardless of working directory
_ENV_FILE = Path(__file__).parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8-sig",  # handles UTF-8 BOM (common on Windows)
        extra="ignore",
    )

    # Database
    DATABASE_URL: str = "postgresql://autopilot_user:autopilot_pass@localhost:5433/autopilot"
    REDIS_URL: str = "redis://localhost:6379/0"

    # AI
    OPENAI_API_KEY: str = ""
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    OPENAI_EMBEDDING_DIMENSIONS: int = 1536
    OPENAI_MODEL_MINI: str = "gpt-4o-mini"
    OPENAI_MODEL_FULL: str = "gpt-4o"

    # Auth
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours

    # CORS — comma-separated string to avoid pydantic-settings JSON parsing
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173,http://127.0.0.1:5174"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    # External services
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""
    SENDGRID_API_KEY: str = ""
    GOOGLE_CALENDAR_CREDENTIALS: str = "./credentials.json"

    # ElevenLabs TTS
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID: str = ""

    # Public URL (used by Twilio to fetch ElevenLabs audio)
    PUBLIC_URL: str = "http://localhost:8000"

    # Seed data (used on first startup)
    ADMIN_EMAIL: str = "admin@immoplus.fr"
    ADMIN_PASSWORD: str = "admin123"

    # Storage
    UPLOAD_DIR: str = "./data/uploads"


settings = Settings()
