from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Any, TypedDict

from langgraph.graph import StateGraph, END
from sqlalchemy.orm import Session

from app.agents.base import BaseAgent
from app.database.models import Conversation, Document, Property, Tenant, WorkflowRun

logger = logging.getLogger(__name__)

# ── Scoring weights ───────────────────────────────────────────────────────────
_SCORE_TYPE    = 30   # exact type match
_SCORE_CITY    = 25   # city match (partial, case-insensitive)
_SCORE_BUDGET  = 20   # price within max_price
_SCORE_SURFACE = 15   # surface >= min_surface
_SCORE_ROOMS   = 10   # nb_rooms >= min_rooms


class OrchestratorState(TypedDict):
    db: Any
    tenant_id: str
    property_id: str
    property: Any                   # Property ORM object
    tenant: Any                     # Tenant ORM object
    run_id: str                     # WorkflowRun.id (str)
    documents_analyzed: list[str]   # document IDs processed
    listings_generated: list[str]   # platforms written
    matching_prospects: list[dict]  # [{name, email, score, criteria}]
    emails_sent: int
    errors: list[str]
    started_at: float


class OrchestratorAgent(BaseAgent):
    """
    Workflow: new property added →
      1. Load property + tenant
      2. Analyze pending documents (with retry)
      3. Generate listings for all platforms (with retry)
      4. Score & find matching prospects
      5. Email each matching prospect
      6. Email agent summary + finalize run record
    """

    @property
    def agent_name(self) -> str:
        return "orchestrator"

    # ── Step tracking helpers ─────────────────────────────────────────────────

    def _update_step(
        self,
        db: Session,
        run_id: str,
        step_name: str,
        status: str,
        detail: str | None = None,
    ) -> None:
        """Append or update a step in WorkflowRun.steps and broadcast notification."""
        try:
            run = db.query(WorkflowRun).filter_by(id=run_id).first()
            if not run:
                return
            steps = list(run.steps or [])
            steps.append({
                "name": step_name,
                "status": status,
                "detail": detail or "",
                "ts": datetime.utcnow().isoformat(),
            })
            run.steps = steps
            db.commit()

            # Broadcast to dashboard WS
            try:
                from app.api.routes.notifications import broadcast
                import asyncio
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(broadcast({
                        "type": "workflow_step",
                        "run_id": run_id,
                        "step": step_name,
                        "status": status,
                        "detail": detail or "",
                    }))
            except Exception:
                pass
        except Exception as exc:
            logger.warning("_update_step failed: %s", exc)

    # ── LangGraph nodes ───────────────────────────────────────────────────────

    def _load_property(self, state: OrchestratorState) -> dict:
        db: Session = state["db"]
        prop = db.query(Property).filter_by(id=state["property_id"]).first()
        if not prop:
            raise ValueError(f"Property {state['property_id']} not found")
        tenant = db.query(Tenant).filter_by(id=state["tenant_id"]).first()

        # Create WorkflowRun record
        run = WorkflowRun(
            tenant_id=state["tenant_id"],
            workflow="new_property",
            entity_id=state["property_id"],
            status="running",
            steps=[],
        )
        db.add(run)
        db.commit()
        db.refresh(run)

        logger.info("Orchestrator: started run %s for property '%s'", run.id, prop.title)
        self._update_step(db, str(run.id), "load_property", "done", prop.title)

        # Push initial notification
        try:
            from app.api.routes.notifications import create_notification
            create_notification(
                db, state["tenant_id"],
                "workflow",
                f"Workflow démarré : {prop.title}",
                "Analyse des documents en cours…",
                {"run_id": str(run.id), "property_id": state["property_id"]},
            )
        except Exception:
            pass

        return {"property": prop, "tenant": tenant, "run_id": str(run.id)}

    def _run_analyst(self, state: OrchestratorState) -> dict:
        from app.agents.analyst import AnalystAgent

        db: Session = state["db"]
        prop: Property = state["property"]
        run_id = state["run_id"]
        analyzed = []
        errors = list(state.get("errors", []))

        pending_docs = (
            db.query(Document)
            .filter_by(property_id=prop.id, status="pending")
            .all()
        )

        if not pending_docs:
            self._update_step(db, run_id, "run_analyst", "skipped", "No pending documents")
            return {"documents_analyzed": analyzed, "errors": errors}

        analyst = AnalystAgent(tenant_id=state["tenant_id"])
        for doc in pending_docs:
            # Retry up to 2 times
            last_exc = None
            for attempt in range(2):
                try:
                    analyst.run(
                        {"document_id": str(doc.id), "file_path": doc.file_url},
                        db,
                    )
                    analyzed.append(str(doc.id))
                    logger.info("Orchestrator: analyzed doc %s (%s)", doc.id, doc.doc_type)
                    last_exc = None
                    break
                except Exception as exc:
                    last_exc = exc
                    logger.warning(
                        "Orchestrator: analyst attempt %d failed for doc %s: %s",
                        attempt + 1, doc.id, exc,
                    )
            if last_exc:
                errors.append(f"analyst:{doc.id}:{last_exc}")
                logger.error("Orchestrator: analyst gave up on doc %s", doc.id)

        status = "done" if not errors else "done_with_errors"
        self._update_step(
            db, run_id, "run_analyst", status,
            f"{len(analyzed)} document(s) analysé(s)" + (f", {len(errors)} erreur(s)" if errors else ""),
        )
        return {"documents_analyzed": analyzed, "errors": errors}

    def _run_writer(self, state: OrchestratorState) -> dict:
        from app.agents.writer import WriterAgent

        db: Session = state["db"]
        prop: Property = state["property"]
        run_id = state["run_id"]
        errors = list(state.get("errors", []))

        # Retry up to 2 times
        last_exc = None
        for attempt in range(2):
            try:
                writer = WriterAgent(tenant_id=state["tenant_id"])
                writer.run({"property_id": str(prop.id)}, db)
                platforms = ["leboncoin", "seloger", "website"]
                logger.info("Orchestrator: listings generated for '%s'", prop.title)
                self._update_step(db, run_id, "run_writer", "done", "3 annonces générées")
                return {"listings_generated": platforms, "errors": errors}
            except Exception as exc:
                last_exc = exc
                logger.warning("Orchestrator: writer attempt %d failed: %s", attempt + 1, exc)

        errors.append(f"writer:{last_exc}")
        self._update_step(db, run_id, "run_writer", "error", str(last_exc))
        return {"listings_generated": [], "errors": errors}

    def _find_matching_prospects(self, state: OrchestratorState) -> dict:
        db: Session = state["db"]
        prop: Property = state["property"]
        tenant: Tenant = state["tenant"]
        run_id = state["run_id"]

        # Read threshold from tenant settings (default 60/100)
        threshold = (tenant.settings or {}).get("ai", {}).get("match_score_threshold", 60)

        # All qualified prospects with known email + criteria
        all_prospects = (
            db.query(Conversation)
            .filter(
                Conversation.tenant_id == state["tenant_id"],
                Conversation.prospect_email.isnot(None),
                Conversation.search_criteria.isnot(None),
            )
            .all()
        )

        matching = []
        for conv in all_prospects:
            criteria = conv.search_criteria or {}
            score, breakdown = _score_criteria(prop, criteria)
            if score >= threshold:
                matching.append({
                    "name": conv.prospect_name or "Prospect",
                    "email": conv.prospect_email,
                    "score": score,
                    "score_breakdown": breakdown,
                    "criteria": criteria,
                })

        # Sort by score descending
        matching.sort(key=lambda x: x["score"], reverse=True)

        logger.info(
            "Orchestrator: %d/%d prospects scored >= %d for '%s'",
            len(matching), len(all_prospects), threshold, prop.title,
        )
        self._update_step(
            db, run_id, "find_matching_prospects", "done",
            f"{len(matching)} prospect(s) scoré(s) ≥ {threshold}/100 sur {len(all_prospects)} total",
        )
        return {"matching_prospects": matching}

    def _notify_prospects(self, state: OrchestratorState) -> dict:
        from app.services.email_service import send_new_property_notification

        db: Session = state["db"]
        prop: Property = state["property"]
        run_id = state["run_id"]
        prospects: list[dict] = state.get("matching_prospects", [])
        sent = 0

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
            try:
                ok = send_new_property_notification(
                    prospect_name=prospect["name"],
                    prospect_email=prospect["email"],
                    property_card=prop_card,
                )
                if ok:
                    sent += 1
            except Exception as exc:
                logger.warning("Orchestrator: email to %s failed: %s", prospect["email"], exc)

        logger.info("Orchestrator: sent %d prospect notifications", sent)
        self._update_step(
            db, run_id, "notify_prospects", "done",
            f"{sent} email(s) envoyé(s) sur {len(prospects)} prospect(s) éligible(s)",
        )
        return {"emails_sent": sent}

    def _finalize(self, state: OrchestratorState) -> dict:
        from app.services.email_service import send_orchestrator_summary

        db: Session = state["db"]
        tenant: Tenant = state["tenant"]
        prop: Property = state["property"]
        run_id = state["run_id"]
        duration_s = round(time.time() - state["started_at"], 1)
        errors = state.get("errors", [])

        # Email agent summary
        try:
            agent_email = (tenant.email if tenant else None) or "contact@immoplus.fr"
            send_orchestrator_summary(
                agent_email=agent_email,
                property_title=prop.title,
                property_city=prop.city,
                documents_analyzed=len(state.get("documents_analyzed", [])),
                listings_generated=state.get("listings_generated", []),
                prospects_notified=state.get("emails_sent", 0),
                duration_s=duration_s,
                errors=errors,
            )
        except Exception as exc:
            logger.warning("Orchestrator: agent summary email failed: %s", exc)

        # Finalize WorkflowRun
        summary = {
            "documents_analyzed": len(state.get("documents_analyzed", [])),
            "listings_generated": state.get("listings_generated", []),
            "prospects_notified": state.get("emails_sent", 0),
            "top_prospects": [
                {"name": p["name"], "score": p["score"]}
                for p in state.get("matching_prospects", [])[:5]
            ],
            "errors": errors,
            "duration_s": duration_s,
        }

        try:
            run = db.query(WorkflowRun).filter_by(id=run_id).first()
            if run:
                run.status = "done" if not errors else "done_with_errors"
                run.summary = summary
                run.completed_at = datetime.utcnow()
                self._update_step(db, run_id, "finalize", "done", f"Terminé en {duration_s}s")
                db.commit()
        except Exception as exc:
            logger.error("Orchestrator: failed to finalize WorkflowRun: %s", exc)

        # Final notification
        try:
            from app.api.routes.notifications import create_notification
            p_count = state.get("emails_sent", 0)
            create_notification(
                db, state["tenant_id"],
                "workflow",
                f"Workflow terminé : {prop.title}",
                f"{len(state.get('listings_generated', []))} annonce(s), {p_count} prospect(s) notifié(s)"
                + (f" · {len(errors)} erreur(s)" if errors else ""),
                {"run_id": run_id, "property_id": state["property_id"]},
            )
        except Exception:
            pass

        logger.info(
            "Orchestrator: run %s complete in %.1fs — docs=%d listings=%d prospects=%d errors=%d",
            run_id, duration_s,
            len(state.get("documents_analyzed", [])),
            len(state.get("listings_generated", [])),
            state.get("emails_sent", 0),
            len(errors),
        )
        return {}

    def _build_graph(self):
        g = StateGraph(OrchestratorState)
        g.add_node("load_property",           self._load_property)
        g.add_node("run_analyst",              self._run_analyst)
        g.add_node("run_writer",               self._run_writer)
        g.add_node("find_matching_prospects",  self._find_matching_prospects)
        g.add_node("notify_prospects",         self._notify_prospects)
        g.add_node("finalize",                 self._finalize)
        g.set_entry_point("load_property")
        g.add_edge("load_property",          "run_analyst")
        g.add_edge("run_analyst",            "run_writer")
        g.add_edge("run_writer",             "find_matching_prospects")
        g.add_edge("find_matching_prospects","notify_prospects")
        g.add_edge("notify_prospects",       "finalize")
        g.add_edge("finalize",               END)
        return g.compile()

    def run(self, input_data: dict[str, Any], db: Session) -> dict[str, Any]:
        graph = self._build_graph()
        state: OrchestratorState = {
            "db": db,
            "tenant_id": self.tenant_id,
            "property_id": input_data["property_id"],
            "property": None,
            "tenant": None,
            "run_id": "",
            "documents_analyzed": [],
            "listings_generated": [],
            "matching_prospects": [],
            "emails_sent": 0,
            "errors": [],
            "started_at": time.time(),
        }
        try:
            result = graph.invoke(state)
        except Exception as exc:
            # Mark run as error if we have a run_id
            run_id = state.get("run_id", "")
            if run_id:
                try:
                    run = db.query(WorkflowRun).filter_by(id=run_id).first()
                    if run:
                        run.status = "error"
                        run.completed_at = datetime.utcnow()
                        db.commit()
                except Exception:
                    pass
            raise

        return {
            "property_id": input_data["property_id"],
            "run_id": result.get("run_id", ""),
            "documents_analyzed": result.get("documents_analyzed", []),
            "listings_generated": result.get("listings_generated", []),
            "prospects_notified": result.get("emails_sent", 0),
            "errors": result.get("errors", []),
        }


# ── Scoring algorithm ─────────────────────────────────────────────────────────

def _score_criteria(prop: Property, criteria: dict) -> tuple[int, dict]:
    """
    Score a property against a prospect's search criteria.
    Returns (total_score, breakdown_dict) where total_score is 0-100.

    Scoring:
      Type exact match  : +30 pts
      City match        : +25 pts
      Budget in range   : +20 pts
      Surface >= min    : +15 pts
      Rooms >= min      : +10 pts
    """
    def _v(key):
        v = criteria.get(key)
        return None if v in (None, "null", "", 0, "0") else v

    breakdown = {}
    total = 0

    # Type match (+30)
    if _v("type"):
        if _v("type").lower() in prop.type.lower():
            breakdown["type"] = _SCORE_TYPE
            total += _SCORE_TYPE
        else:
            breakdown["type"] = 0
    else:
        # No preference → full points
        breakdown["type"] = _SCORE_TYPE
        total += _SCORE_TYPE

    # City match (+25)
    if _v("city"):
        if _v("city").lower() in prop.city.lower() or prop.city.lower() in _v("city").lower():
            breakdown["city"] = _SCORE_CITY
            total += _SCORE_CITY
        else:
            breakdown["city"] = 0
    else:
        breakdown["city"] = _SCORE_CITY
        total += _SCORE_CITY

    # Budget (+20)
    max_price = _v("max_price")
    min_price = _v("min_price")
    if max_price is not None:
        try:
            if prop.price <= float(max_price):
                breakdown["budget"] = _SCORE_BUDGET
                total += _SCORE_BUDGET
            else:
                # Partial credit if within 10% over budget
                overage = (prop.price - float(max_price)) / float(max_price)
                if overage <= 0.10:
                    partial = int(_SCORE_BUDGET * (1 - overage / 0.10))
                    breakdown["budget"] = partial
                    total += partial
                else:
                    breakdown["budget"] = 0
        except (ValueError, TypeError):
            breakdown["budget"] = _SCORE_BUDGET
            total += _SCORE_BUDGET
    else:
        breakdown["budget"] = _SCORE_BUDGET
        total += _SCORE_BUDGET

    # Surface (+15)
    min_surface = _v("min_surface")
    if min_surface is not None:
        try:
            if prop.surface >= float(min_surface):
                breakdown["surface"] = _SCORE_SURFACE
                total += _SCORE_SURFACE
            else:
                # Partial if within 15% under
                deficit = (float(min_surface) - prop.surface) / float(min_surface)
                if deficit <= 0.15:
                    partial = int(_SCORE_SURFACE * (1 - deficit / 0.15))
                    breakdown["surface"] = partial
                    total += partial
                else:
                    breakdown["surface"] = 0
        except (ValueError, TypeError):
            breakdown["surface"] = _SCORE_SURFACE
            total += _SCORE_SURFACE
    else:
        breakdown["surface"] = _SCORE_SURFACE
        total += _SCORE_SURFACE

    # Rooms (+10)
    min_rooms = _v("min_rooms") or _v("nb_rooms")
    if min_rooms is not None:
        try:
            if prop.nb_rooms >= int(min_rooms):
                breakdown["rooms"] = _SCORE_ROOMS
                total += _SCORE_ROOMS
            else:
                breakdown["rooms"] = 0
        except (ValueError, TypeError):
            breakdown["rooms"] = _SCORE_ROOMS
            total += _SCORE_ROOMS
    else:
        breakdown["rooms"] = _SCORE_ROOMS
        total += _SCORE_ROOMS

    return min(total, 100), breakdown
