"""
Abstract base class for all mock external services.

Each mock service implements a clean interface so it can be swapped for
a real Outlook / Teams / SharePoint integration later without touching any
agent or service code.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any


class BaseMockService(ABC):
    """Shared logging scaffold for all mock services."""

    service_name: str = "base_mock"

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def log_call(self, method: str, payload: dict) -> None:
        """Lightweight call log — replace with proper logger in production."""
        ts = self._now()
        print(f"[{ts}] [{self.service_name}] {method}: {payload}")

    def mock_response(self, success: bool = True, **kwargs: Any) -> dict:
        return {
            "success": success,
            "service": self.service_name,
            "timestamp": self._now(),
            **kwargs,
        }
