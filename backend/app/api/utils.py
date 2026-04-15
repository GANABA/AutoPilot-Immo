from __future__ import annotations

import re
from urllib.parse import urlparse


def sanitize_user_input(text: str, max_length: int = 2000) -> str:
    """
    Strip control characters, excessive whitespace, and truncate.
    Prevents prompt injection and oversized payloads.
    """
    # Remove null bytes and control characters (except newline/tab)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    # Collapse excessive blank lines
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    # Strip common prompt injection markers
    for marker in ("SYSTEM:", "###SYSTEM", "<|im_start|>", "<|im_end|>",
                   "Ignore previous instructions", "Ignore all previous"):
        text = text.replace(marker, "")
    return text[:max_length].strip()


def is_safe_url(url: str) -> bool:
    """Return False for local/internal URLs and non-http(s) schemes."""
    if not url:
        return True  # empty = no URL configured, OK
    try:
        p = urlparse(url)
        if p.scheme not in ("http", "https"):
            return False
        host = p.hostname or ""
        if host in ("localhost", "127.0.0.1", "0.0.0.0", "::1"):
            return False
        if host.startswith("192.168.") or host.startswith("10.") or host.startswith("172."):
            return False
    except Exception:
        return False
    return True
