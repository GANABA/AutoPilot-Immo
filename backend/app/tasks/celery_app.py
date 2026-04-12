from celery import Celery
from celery.schedules import crontab
from app.config import settings

celery_app = Celery(
    "autopilot",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.document_tasks",
        "app.tasks.followup_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Paris",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        # Every day at 9:00 Paris time — send J+7 follow-up emails
        "followup-j7-daily": {
            "task": "app.tasks.followup_tasks.send_followup_drafts",
            "schedule": crontab(hour=9, minute=0),
        },
    },
)
