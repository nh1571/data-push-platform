"""Shared FastAPI dependencies (re-export identity deps for convenience)."""

from app.modules.identity.deps import get_current_principal
from app.modules.identity.schemas import Principal

__all__ = ["Principal", "get_current_principal"]
