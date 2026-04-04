from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, TypedDict

import pdfplumber
from langgraph.graph import StateGraph, END
from openai import OpenAI
from sqlalchemy.orm import Session

from app.agents.base import BaseAgent
from app.config import settings
from app.database.models import Document

logger = logging.getLogger(__name__)


class AnalystState(TypedDict):
    db: Any
    document_id: str
    file_path: str        # absolute path to PDF on disk
    raw_text: str         # text extracted from PDF
    doc_type: str         # dpe | copro | mandat | other
    extracted_data: dict  # structured extraction result
    page_count: int


# ── Extraction prompts per document type ─────────────────────────────────────

_CLASSIFY_PROMPT = """Classifie ce document immobilier parmi les types suivants :
- dpe       : Diagnostic de Performance Énergétique
- copro     : Documents de copropriété (procès-verbal, charges, règlement)
- mandat    : Mandat de vente ou location
- other     : Autre document immobilier

Réponds UNIQUEMENT avec le type en minuscules (ex: dpe).

Extrait du document :
{text_sample}"""

_EXTRACT_PROMPTS: dict[str, str] = {
    "dpe": """Extrais les informations suivantes du DPE.
Réponds UNIQUEMENT avec un JSON valide :
{
  "energy_class": "lettre A-G ou null",
  "ges_class": "lettre A-G ou null",
  "energy_consumption_kwh": number ou null,
  "ges_emissions_kg": number ou null,
  "expiry_date": "YYYY-MM-DD ou null",
  "heating_type": "texte ou null",
  "surface_reference": number ou null
}

Document :
{text}""",

    "copro": """Extrais les informations suivantes du document de copropriété.
Réponds UNIQUEMENT avec un JSON valide :
{
  "annual_charges": number ou null,
  "number_of_lots": number ou null,
  "syndic_name": "texte ou null",
  "assembly_date": "YYYY-MM-DD ou null",
  "building_year": number ou null,
  "outstanding_works": "texte ou null",
  "special_fund": number ou null
}

Document :
{text}""",

    "mandat": """Extrais les informations suivantes du mandat immobilier.
Réponds UNIQUEMENT avec un JSON valide :
{
  "mandate_type": "exclusif | simple | semi-exclusif | null",
  "property_price": number ou null,
  "agency_commission_pct": number ou null,
  "duration_months": number ou null,
  "mandant_name": "texte ou null",
  "start_date": "YYYY-MM-DD ou null",
  "end_date": "YYYY-MM-DD ou null",
  "property_address": "texte ou null"
}

Document :
{text}""",

    "other": """Extrais les informations clés de ce document immobilier.
Réponds UNIQUEMENT avec un JSON valide contenant les champs pertinents trouvés
(max 10 champs, valeurs texte ou numériques).

Document :
{text}""",
}


class AnalystAgent(BaseAgent):
    """Extracts structured data from real estate PDF documents."""

    def __init__(self, tenant_id: str):
        super().__init__(tenant_id)
        self._client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self._graph = self._build_graph()

    @property
    def agent_name(self) -> str:
        return "analyst"

    # ── LangGraph nodes ───────────────────────────────────────────────────────

    def _extract_text(self, state: AnalystState) -> dict:
        """Node 1 — extract raw text from PDF using pdfplumber."""
        path = Path(state["file_path"])
        if not path.exists():
            raise FileNotFoundError(f"PDF not found: {path}")

        text_parts: list[str] = []
        page_count = 0

        with pdfplumber.open(str(path)) as pdf:
            page_count = len(pdf.pages)
            for page in pdf.pages[:20]:   # cap at 20 pages for cost control
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)

        raw_text = "\n\n".join(text_parts).strip()
        if not raw_text:
            raw_text = "[Document sans texte extractible — probablement scanné]"

        logger.info("Extracted %d chars from %d pages", len(raw_text), page_count)
        return {"raw_text": raw_text, "page_count": page_count}

    def _classify_document(self, state: AnalystState) -> dict:
        """Node 2 — classify document type using GPT-4o-mini."""
        sample = state["raw_text"][:2000]
        prompt = _CLASSIFY_PROMPT.replace("{text_sample}", sample)
        resp = self._client.chat.completions.create(
            model=settings.OPENAI_MODEL_MINI,
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            temperature=0,
            max_tokens=10,
        )
        doc_type = resp.choices[0].message.content.strip().lower()
        if doc_type not in _EXTRACT_PROMPTS:
            doc_type = "other"
        logger.info("Document classified as: %s", doc_type)
        return {"doc_type": doc_type}

    def _extract_structured_data(self, state: AnalystState) -> dict:
        """Node 3 — extract structured fields using GPT-4o."""
        prompt_template = _EXTRACT_PROMPTS[state["doc_type"]]
        # Truncate text to avoid excessive token usage
        text = state["raw_text"][:6000]

        # Use replace() instead of format() — PDF text may contain { } characters
        prompt = prompt_template.replace("{text}", text)

        resp = self._client.chat.completions.create(
            model=settings.OPENAI_MODEL_FULL,
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
        try:
            extracted = json.loads(resp.choices[0].message.content)
        except Exception as exc:
            logger.warning("JSON parse failed: %s", exc)
            extracted = {"raw_response": resp.choices[0].message.content}

        return {"extracted_data": extracted}

    def _save_results(self, state: AnalystState) -> dict:
        """Node 4 — persist results to Document record."""
        db: Session = state["db"]
        doc = db.query(Document).filter_by(id=state["document_id"]).first()
        if doc:
            doc.doc_type = state["doc_type"]
            doc.extracted_data = {
                **state["extracted_data"],
                "_meta": {
                    "page_count": state["page_count"],
                    "text_length": len(state["raw_text"]),
                },
            }
            doc.status = "done"
            db.commit()
        return {}

    def _build_graph(self):
        g = StateGraph(AnalystState)
        g.add_node("extract_text", self._extract_text)
        g.add_node("classify_document", self._classify_document)
        g.add_node("extract_structured_data", self._extract_structured_data)
        g.add_node("save_results", self._save_results)
        g.set_entry_point("extract_text")
        g.add_edge("extract_text", "classify_document")
        g.add_edge("classify_document", "extract_structured_data")
        g.add_edge("extract_structured_data", "save_results")
        g.add_edge("save_results", END)
        return g.compile()

    # ── Public API ─────────────────────────────────────────────────────────────

    def run(self, input_data: dict[str, Any], db: Session) -> dict[str, Any]:
        state: AnalystState = {
            "db": db,
            "document_id": input_data["document_id"],
            "file_path": input_data["file_path"],
            "raw_text": "",
            "doc_type": "other",
            "extracted_data": {},
            "page_count": 0,
        }
        result = self._graph.invoke(state)
        return {
            "doc_type": result["doc_type"],
            "extracted_data": result["extracted_data"],
            "page_count": result["page_count"],
        }
