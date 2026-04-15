"""
Web crawler service.

Crawls an agency website, extracts text content, splits into chunks,
generates embeddings, and stores them in the KnowledgeChunk table.
The SupportAgent uses these chunks to answer questions about the agency
(services, fees, coverage areas, team, etc.) beyond the property catalogue.
"""
from __future__ import annotations

import logging
import re
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from app.api.schemas import CrawlStatus
from app.config import settings
from app.database.models import KnowledgeChunk, Tenant
from app.database.vector_store import generate_embedding

logger = logging.getLogger(__name__)

# Pages to crawl max (free tier safety)
MAX_PAGES = 20
# Minimum chunk length to embed (skip very short fragments)
MIN_CHUNK_CHARS = 80
# Max chunk length (split long content into smaller pieces)
MAX_CHUNK_CHARS = 800

_IGNORED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg",
                       ".mp4", ".zip", ".doc", ".docx", ".xls"}
_IGNORED_PATHS = {"/cdn-cgi/", "/wp-json/", "/xmlrpc", "/wp-admin",
                  "/wp-content/uploads/", "javascript:", "mailto:", "tel:"}


def _is_crawlable(url: str, base_domain: str) -> bool:
    parsed = urlparse(url)
    if parsed.netloc and parsed.netloc != base_domain:
        return False  # external link
    path = parsed.path.lower()
    if any(path.endswith(ext) for ext in _IGNORED_EXTENSIONS):
        return False
    if any(ignored in url for ignored in _IGNORED_PATHS):
        return False
    return True


def _extract_chunks(soup: BeautifulSoup, url: str) -> list[dict]:
    """Extract meaningful text chunks from a parsed page."""
    # Remove script, style, nav, footer, cookie banners
    for tag in soup(["script", "style", "nav", "footer", "header",
                     "noscript", "aside", "form"]):
        tag.decompose()

    title = soup.title.string.strip() if soup.title else ""

    # Try main content areas first, fall back to body
    container = (
        soup.find("main")
        or soup.find("article")
        or soup.find(id=re.compile(r"content|main|page", re.I))
        or soup.find(class_=re.compile(r"content|main|page", re.I))
        or soup.body
    )
    if not container:
        return []

    chunks = []

    # Split by semantic sections (h2/h3 → paragraph groups)
    current_heading = title
    current_text = []

    for el in container.find_all(["h1", "h2", "h3", "p", "li", "td", "th"]):
        text = el.get_text(separator=" ", strip=True)
        if not text:
            continue

        if el.name in ("h1", "h2", "h3"):
            # Flush current section
            if current_text:
                chunk_text = " ".join(current_text)
                if len(chunk_text) >= MIN_CHUNK_CHARS:
                    chunks.append({
                        "title": current_heading,
                        "content": chunk_text[:MAX_CHUNK_CHARS],
                        "source_id": url,
                    })
            current_heading = text
            current_text = []
        else:
            current_text.append(text)
            # Split if chunk is getting too long
            joined = " ".join(current_text)
            if len(joined) > MAX_CHUNK_CHARS:
                chunks.append({
                    "title": current_heading,
                    "content": joined[:MAX_CHUNK_CHARS],
                    "source_id": url,
                })
                current_text = []

    # Flush last section
    if current_text:
        chunk_text = " ".join(current_text)
        if len(chunk_text) >= MIN_CHUNK_CHARS:
            chunks.append({
                "title": current_heading,
                "content": chunk_text[:MAX_CHUNK_CHARS],
                "source_id": url,
            })

    return chunks


def crawl_website(tenant_id: str, website_url: str, db: Session) -> CrawlStatus:
    """
    Crawl the agency website.

    Steps:
    1. Fetch and parse pages (BFS, max MAX_PAGES)
    2. Extract text chunks per page
    3. Generate embeddings for each chunk
    4. Delete old chunks for this tenant, insert new ones
    5. Update website_crawled_at in tenant settings
    """
    parsed_base = urlparse(website_url)
    base_domain = parsed_base.netloc

    session = requests.Session()
    session.headers.update({
        "User-Agent": "AutoPilotImmo/1.0 (agency website indexer)",
        "Accept-Language": "fr-FR,fr;q=0.9",
    })

    visited: set[str] = set()
    queue: list[str] = [website_url]
    all_chunks: list[dict] = []
    pages_crawled = 0

    while queue and pages_crawled < MAX_PAGES:
        url = queue.pop(0)
        if url in visited:
            continue
        visited.add(url)

        try:
            resp = session.get(url, timeout=10, allow_redirects=True)
            if resp.status_code != 200:
                continue
            if "text/html" not in resp.headers.get("content-type", ""):
                continue
        except Exception as exc:
            logger.warning("Crawl: failed to fetch %s — %s", url, exc)
            continue

        soup = BeautifulSoup(resp.text, "html.parser")
        pages_crawled += 1
        logger.info("Crawl: page %d — %s", pages_crawled, url)

        # Extract chunks
        chunks = _extract_chunks(soup, url)
        all_chunks.extend(chunks)

        # Discover links
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if not href or href.startswith("#"):
                continue
            abs_url = urljoin(url, href).split("#")[0].rstrip("/")
            if abs_url not in visited and _is_crawlable(abs_url, base_domain):
                queue.append(abs_url)

    logger.info("Crawl done: %d pages, %d raw chunks", pages_crawled, len(all_chunks))

    if not all_chunks:
        return CrawlStatus(
            status="done",
            pages_crawled=pages_crawled,
            chunks_stored=0,
            message="Aucun contenu texte trouvé sur le site.",
        )

    # Delete existing chunks for this tenant
    db.query(KnowledgeChunk).filter_by(
        tenant_id=tenant_id, source_type="website"
    ).delete()
    db.flush()

    # Generate embeddings and insert
    stored = 0
    for chunk in all_chunks:
        try:
            embedding = generate_embedding(f"{chunk['title']}\n{chunk['content']}")
        except Exception as exc:
            logger.warning("Embedding failed for chunk: %s", exc)
            continue

        db.add(KnowledgeChunk(
            tenant_id=tenant_id,
            source_type="website",
            source_id=chunk["source_id"],
            title=chunk["title"],
            content=chunk["content"],
            embedding=embedding,
        ))
        stored += 1

    # Update website_crawled_at in settings
    tenant = db.query(Tenant).filter_by(id=tenant_id).first()
    if tenant:
        from datetime import datetime, timezone
        s = dict(tenant.settings or {})
        agency = dict(s.get("agency", {}))
        agency["website_crawled_at"] = datetime.now(timezone.utc).isoformat()
        s["agency"] = agency
        tenant.settings = s

    db.commit()
    logger.info("Crawl: stored %d chunks for tenant %s", stored, tenant_id)

    return CrawlStatus(
        status="done",
        pages_crawled=pages_crawled,
        chunks_stored=stored,
        message=f"{pages_crawled} pages analysées, {stored} blocs de contenu indexés.",
    )
