from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

# Working hours for visit slots
_SLOT_START_HOUR = 9   # 09:00
_SLOT_END_HOUR = 18    # 18:00
_SLOT_DURATION = 60    # minutes
_DAYS_AHEAD = 7        # look 7 days forward
_MAX_SLOTS = 5


def _get_service():
    """Build and return a Google Calendar API service using a Service Account."""
    import json as _json
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    creds_raw = settings.GOOGLE_CALENDAR_CREDENTIALS_JSON
    if not creds_raw:
        raise ValueError("GOOGLE_CALENDAR_CREDENTIALS_JSON is not set")

    creds_dict = _json.loads(creds_raw)
    creds = service_account.Credentials.from_service_account_info(
        creds_dict,
        scopes=["https://www.googleapis.com/auth/calendar"],
    )
    return build("googleapiclient", "v1", credentials=creds, service_name="calendar", version="v3")


def _is_configured() -> bool:
    return bool(settings.GOOGLE_CALENDAR_CREDENTIALS_JSON and settings.GOOGLE_CALENDAR_ID)


def _mock_slots() -> list[dict]:
    """Return realistic-looking slots when Calendar is not configured (demo fallback)."""
    now = datetime.now()
    slots = []
    d = now + timedelta(days=1)
    while len(slots) < _MAX_SLOTS:
        # Skip weekends
        if d.weekday() < 5:
            for hour in [10, 14, 16]:
                if len(slots) >= _MAX_SLOTS:
                    break
                slot_dt = d.replace(hour=hour, minute=0, second=0, microsecond=0)
                fr_days = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
                fr_months = ["janvier", "février", "mars", "avril", "mai", "juin",
                             "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
                label = f"{fr_days[slot_dt.weekday()]} {slot_dt.day} {fr_months[slot_dt.month - 1]} à {hour}h"
                slots.append({
                    "label": label,
                    "datetime": slot_dt.isoformat(),
                    "display": f"{label.capitalize()}",
                })
        d += timedelta(days=1)
    return slots


def get_available_slots() -> list[dict]:
    """
    Returns the next available 1h visit slots.
    Falls back to mock slots if Google Calendar is not configured.
    Each slot: {"label": "jeudi 17 avril à 10h", "datetime": "2026-04-17T10:00:00", "display": "..."}
    """
    if not _is_configured():
        logger.info("Calendar: not configured — using mock slots")
        return _mock_slots()

    try:
        from googleapiclient.discovery import build
        from google.oauth2 import service_account

        creds_dict = json.loads(settings.GOOGLE_CALENDAR_CREDENTIALS_JSON)
        creds = service_account.Credentials.from_service_account_info(
            creds_dict,
            scopes=["https://www.googleapis.com/auth/calendar"],
        )
        service = build("calendar", "v3", credentials=creds)
        cal_id = settings.GOOGLE_CALENDAR_ID

        now = datetime.now(timezone.utc)
        time_max = now + timedelta(days=_DAYS_AHEAD)

        # Fetch existing events to find busy periods
        events_result = service.events().list(
            calendarId=cal_id,
            timeMin=now.isoformat(),
            timeMax=time_max.isoformat(),
            singleEvents=True,
            orderBy="startTime",
        ).execute()
        busy_events = events_result.get("items", [])

        busy_ranges = []
        for ev in busy_events:
            start = ev["start"].get("dateTime")
            end = ev["end"].get("dateTime")
            if start and end:
                busy_ranges.append((
                    datetime.fromisoformat(start.replace("Z", "+00:00")),
                    datetime.fromisoformat(end.replace("Z", "+00:00")),
                ))

        # Generate candidate slots and filter out busy ones
        slots = []
        d = now.date() + timedelta(days=1)
        fr_days = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
        fr_months = ["janvier", "février", "mars", "avril", "mai", "juin",
                     "juillet", "août", "septembre", "octobre", "novembre", "décembre"]

        while len(slots) < _MAX_SLOTS and d <= time_max.date():
            if d.weekday() < 5:  # weekdays only
                for hour in range(_SLOT_START_HOUR, _SLOT_END_HOUR, _SLOT_DURATION // 60):
                    slot_start = datetime(d.year, d.month, d.day, hour, 0, 0, tzinfo=timezone.utc)
                    slot_end = slot_start + timedelta(minutes=_SLOT_DURATION)

                    # Check not busy
                    overlap = any(
                        not (slot_end <= b_start or slot_start >= b_end)
                        for b_start, b_end in busy_ranges
                    )
                    if not overlap:
                        label = f"{fr_days[d.weekday()]} {d.day} {fr_months[d.month - 1]} à {hour}h"
                        slots.append({
                            "label": label,
                            "datetime": slot_start.isoformat(),
                            "display": label.capitalize(),
                        })
                    if len(slots) >= _MAX_SLOTS:
                        break
            d += timedelta(days=1)

        logger.info("Calendar: found %d available slots", len(slots))
        return slots

    except Exception as exc:
        logger.error("Calendar get_available_slots error: %s", exc, exc_info=True)
        return _mock_slots()


def create_visit_event(
    slot_datetime: str,
    prospect_name: str,
    prospect_email: str,
    property_title: str,
    property_address: str = "",
    agent_email: str = "",
) -> str | None:
    """
    Creates a 1-hour visit event in Google Calendar.
    Returns the event ID, or None if Calendar is not configured / fails.
    """
    if not _is_configured():
        logger.info("Calendar: not configured — skipping event creation (slot: %s)", slot_datetime)
        return f"mock-event-{slot_datetime[:10]}"

    try:
        from googleapiclient.discovery import build
        from google.oauth2 import service_account

        creds_dict = json.loads(settings.GOOGLE_CALENDAR_CREDENTIALS_JSON)
        creds = service_account.Credentials.from_service_account_info(
            creds_dict,
            scopes=["https://www.googleapis.com/auth/calendar"],
        )
        service = build("calendar", "v3", credentials=creds)
        cal_id = settings.GOOGLE_CALENDAR_ID

        start_dt = datetime.fromisoformat(slot_datetime)
        end_dt = start_dt + timedelta(minutes=_SLOT_DURATION)

        attendees = [{"email": prospect_email}]
        if agent_email:
            attendees.append({"email": agent_email})

        event = {
            "summary": f"Visite — {property_title}",
            "location": property_address,
            "description": (
                f"Visite organisée via le chatbot ImmoPlus.\n"
                f"Prospect : {prospect_name} ({prospect_email})\n"
                f"Bien : {property_title}"
            ),
            "start": {"dateTime": start_dt.isoformat(), "timeZone": "Europe/Paris"},
            "end": {"dateTime": end_dt.isoformat(), "timeZone": "Europe/Paris"},
            "attendees": attendees,
            "reminders": {
                "useDefault": False,
                "overrides": [
                    {"method": "email", "minutes": 24 * 60},
                    {"method": "popup", "minutes": 60},
                ],
            },
        }

        created = service.events().insert(
            calendarId=cal_id,
            body=event,
            sendUpdates="all",
        ).execute()

        event_id = created.get("id")
        logger.info("Calendar: event created %s for %s", event_id, prospect_email)
        return event_id

    except Exception as exc:
        logger.error("Calendar create_visit_event error: %s", exc, exc_info=True)
        return None
