from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Any, TypedDict

from langgraph.graph import StateGraph, END
from sqlalchemy.orm import Session

from app.agents.base import BaseAgent
from app.database.models import AgentTask, Conversation, Document, Property, Tenant

logger = logging.getLogger(__name__)


class OrchestratorState(TypedDict):
    db: Any
    tenant_id: str
    property_id: str
    property: Any                  # Property ORM object
    tenant: Any                    # Tenant ORM object
    documents_analyzed: list[str]  # document IDs processed
    listings_generated: list[str]  # platforms written
    matching_prospects: list[dict] # [{name, email, criteria}]
    emails_sent: int
    errors: list[str]
    started_at: float


class OrchestratorAgent(BaseAgent):
    """
    Workflow: new property added →
      1. Analyze uploaded documents (DPE, charges, mandat)
      2. Generate listings for all platforms
      3. Find matching prospects in conversation history
      4. Email each matching prospect
      5. Email agent summary
    """

    @property
    def agent_name(self) -> str:
        return "orchestrator"

    # ── LangGraph nodes ───────────────────────────────────────────────────────

    def _load_property(self, state: OrchestratorState) -> dict:
        """Node 1 — load property and tenant from DB."""
        db: Session = state["db"]
        prop = db.query(Property).filter_by(id=state["property_id"]).first()
        if not prop:
            raise ValueError(f"Property {state['property_id']} not found")
        tenant = db.query(Tenant).filter_by(id=state["tenant_id"]).first()
        logger.info("Orchestrator: loaded property '%s'", prop.title)
        return {"property": prop, "tenant": tenant}

    def _run_analyst(self, state: OrchestratorState) -> dict:
        """Node 2 — analyze any pending documents for this property."""
        from app.agents.analyst import AnalystAgent

        db: Session = state["db"]
        prop: Property = state["property"]
        analyzed = []
        errors = list(state.get("errors", []))

        pending_docs = (
            db.query(Document)
            .filter_by(property_id=prop.id, status="pending")
            .all()
        )

        if not pending_docs:
            logger.info("Orchestrator: no pending documents for property %s", prop.id)
            return {"documents_analyzed": analyzed, "errors": errors}

        analyst = AnalystAgent(tenant_id=state["tenant_id"])
        for doc in pending_docs:
            try:
                analyst.run(
                    {"document_id": str(doc.id), "file_path": doc.file_url},
                    db,
                )
                analyzed.append(str(doc.id))
                logger.info("Orchestrator: analyzed document %s (%s)", doc.id, doc.doc_type)
            except Exception as exc:
                logger.error("Orchestrator: analyst failed for doc %s: %s", doc.id, exc)
                errors.append(f"analyst:{doc.id}:{exc}")

        return {"documents_analyzed": analyzed, "errors": errors}

    def _run_writer(self, state: OrchestratorState) -> dict:
        """Node 3 — generate listings for all 3 platforms."""
        from app.agents.writer import WriterAgent

        db: Session = state["db"]
        prop: Property = state["property"]
        errors = list(state.get("errors", []))

        try:
            writer = WriterAgent(tenant_id=state["tenant_id"])
            writer.run({"property_id": str(prop.id)}, db)
            platforms = ["leboncoin", "seloger", "website"]
            logger.info("Orchestrator: listings generated for %s", prop.title)
            return {"listings_generated": platforms, "errors": errors}
        except Exception as exc:
            logger.error("Orchestrator: writer failed: %s", exc)
            errors.append(f"writer:{exc}")
            return {"listings_generated": [], "errors": errors}

    def _find_matching_prospects(self, state: OrchestratorState) -> dict:
        """Node 4 — find prospects whose criteria match the new property."""
        db: Session = state["db"]
        prop: Property = state["property"]

        # Get all qualified prospects (have email + stored search criteria)
        prospects_q = (
            db.query(Conversation)
            .filter(
                Conversation.tenant_id == state["tenant_id"],
                Conversation.prospect_email.isnot(None),
                Conversation.search_criteria.isnot(None),
            )
            .all()
        )

        matching = []
        for conv in prospects_q:
            criteria = conv.search_criteria or {}
            if _matches_criteria(prop, criteria):
                matching.append({
                    "name": conv.prospect_name or "Prospect",
                    "email": conv.prospect_email,
                    "criteria": criteria,
                })

        logger.info(
            "Orchestrator: %d/%d prospects match property '%s'",
            len(matching), len(prospects_q), prop.title,
        )
        return {"matching_prospects": matching}

    def _notify_prospects(self, state: OrchestratorState) -> dict:
        """Node 5 — email each matching prospect about the new property."""
        from app.services.email_service import send_new_property_notification

        prop: Property = state["property"]
        prospects: list[dict] = state.get("matching_prospects", [])
        sent = 0

        # Build a property card dict for the email
        prop_card = {
            "id": str(prop.id),
            "title": prop.title,
            "price": prop.price,
            "surface": prop.surface,
            "nb_rooms": prop.nb_rooms,
            "city": prop.city,
            "zipcode": prop.zipcode or "",
            "type": prop.type,
        }

        for prospect in prospects:
            ok = send_new_property_notification(
                prospect_name=prospect["name"],
                prospect_email=prospect["email"],
                property_card=prop_card,
            )
            if ok:
                sent += 1

        logger.info("Orchestrator: sent %d prospect notifications", sent)
        return {"emails_sent": sent}

    def _notify_agent(self, state: OrchestratorState) -> dict:
        """Node 6 — send a summary email to the agent."""
        from app.services.email_service import send_orchestrator_summary

        tenant: Tenant = state["tenant"]
        prop: Property = state["property"]
        duration_s = round(time.time() - state["started_at"], 1)

        agent_email = (tenant.email if tenant else None) or "contact@immoplus.fr"

        send_orchestrator_summary(
            agent_email=agent_email,
            property_title=prop.title,
            property_city=prop.city,
            documents_analyzed=len(state.get("documents_analyzed", [])),
            listings_generated=state.get("listings_generated", []),
            prospects_notified=state.get("emails_sent", 0),
            duration_s=duration_s,
            errors=state.get("errors", []),
        )

        # Log AgentTask
        db: Session = state["db"]
        try:
            db.add(AgentTask(
                tenant_id=state["tenant_id"],
                agent="orchestrator",
                action="new_property",
                input_data={"property_id": state["property_id"]},
                output_data={
                    "documents_analyzed": state.get("documents_analyzed", []),
                    "listings_generated": state.get("listings_generated", []),
                    "prospects_notified": state.get("emails_sent", 0),
                    "errors": state.get("errors", []),
                },
                status="done" if not state.get("errors") else "done_with_errors",
                duration_ms=int(duration_s * 1000),
                completed_at=datetime.utcnow(),
            ))
            db.commit()
        except Exception as exc:
            logger.error("Orchestrator: failed to log AgentTask: %s", exc)

        logger.info(
            "Orchestrator: workflow complete in %.1fs — docs=%d listings=%d prospects=%d errors=%d",
            duration_s,
            len(state.get("documents_analyzed", [])),
            len(state.get("listings_generated", [])),
            state.get("emails_sent", 0),
            len(state.get("errors", [])),
        )
        return {}

    def _build_graph(self):
        g = StateGraph(OrchestratorState)
        g.add_node("load_property", self._load_property)
        g.add_node("run_analyst", self._run_analyst)
        g.add_node("run_writer", self._run_writer)
        g.add_node("find_matching_prospects", self._find_matching_prospects)
        g.add_node("notify_prospects", self._notify_prospects)
        g.add_node("notify_agent", self._notify_agent)
        g.set_entry_point("load_property")
        g.add_edge("load_property", "run_analyst")
        g.add_edge("run_analyst", "run_writer")
        g.add_edge("run_writer", "find_matching_prospects")
        g.add_edge("find_matching_prospects", "notify_prospects")
        g.add_edge("notify_prospects", "notify_agent")
        g.add_edge("notify_agent", END)
        return g.compile()

    # ── Public API ─────────────────────────────────────────────────────────────

    def run(self, input_data: dict[str, Any], db: Session) -> dict[str, Any]:
        graph = self._build_graph()
        state: OrchestratorState = {
            "db": db,
            "tenant_id": self.tenant_id,
            "property_id": input_data["property_id"],
            "property": None,
            "tenant": None,
            "documents_analyzed": [],
            "listings_generated": [],
            "matching_prospects": [],
            "emails_sent": 0,
            "errors": [],
            "started_at": time.time(),
        }
        result = graph.invoke(state)
        return {
            "property_id": input_data["property_id"],
            "documents_analyzed": result.get("documents_analyzed", []),
            "listings_generated": result.get("listings_generated", []),
            "prospects_notified": result.get("emails_sent", 0),
            "errors": result.get("errors", []),
        }


# ── Criteria matching helper ──────────────────────────────────────────────────

def _matches_criteria(prop: Property, criteria: dict) -> bool:
    """Returns True if a property satisfies prospect search criteria."""
    def _v(key):
        v = criteria.get(key)
        return None if v in (None, "null", "") else v

    # Type match
    if _v("type") and _v("type").lower() not in prop.type.lower():
        return False

    # City match (partial, case-insensitive)
    if _v("city") and _v("city").lower() not in prop.city.lower():
        return False

    # Price range
    if _v("max_price") and prop.price > float(_v("max_price")):
        return False
    if _v("min_price") and prop.price < float(_v("min_price")):
        return False

    # Surface
    if _v("min_surface") and prop.surface < float(_v("min_surface")):
        return False

    # Rooms
    if _v("min_rooms") and prop.nb_rooms < int(_v("min_rooms")):
        return False

    return True
