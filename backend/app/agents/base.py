from abc import ABC, abstractmethod
from typing import Any
from sqlalchemy.orm import Session


class BaseAgent(ABC):
    """Abstract base class for all AutoPilot agents."""

    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id

    @abstractmethod
    def run(self, input_data: dict[str, Any], db: Session) -> dict[str, Any]:
        """Execute the agent and return its results."""
        ...

    @property
    @abstractmethod
    def agent_name(self) -> str:
        """Identifier used in AgentTask logging."""
        ...
