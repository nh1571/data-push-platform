"""Aggregate API v1 router (prefix ``/api/v1``).

All routes require :func:`~app.deps.get_current_principal` except
``POST /api/v1/auth/login``.
"""

from fastapi import APIRouter, Depends

from app.api.v1 import api_tokens, auth, channels, data_sources, push_jobs
from app.deps import get_current_principal

api_router = APIRouter(prefix="/api/v1")

# Public auth routes (no principal required)
api_router.include_router(
    auth.router,
    prefix="/auth",
    tags=["auth"],
)

# Protected resource routers
_protected = [Depends(get_current_principal)]

api_router.include_router(
    data_sources.router,
    prefix="/data-sources",
    tags=["data-sources"],
    dependencies=_protected,
)
api_router.include_router(
    channels.router,
    prefix="/channels",
    tags=["channels"],
    dependencies=_protected,
)
api_router.include_router(
    push_jobs.router,
    prefix="/push-jobs",
    tags=["push-jobs"],
    dependencies=_protected,
)
api_router.include_router(
    api_tokens.router,
    prefix="/api-tokens",
    tags=["api-tokens"],
    dependencies=_protected,
)
