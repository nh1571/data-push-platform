"""Aggregate API v1 router (prefix ``/api/v1``)."""

from fastapi import APIRouter

from app.api.v1 import channels, data_sources, push_jobs

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(
    data_sources.router,
    prefix="/data-sources",
    tags=["data-sources"],
)
api_router.include_router(
    channels.router,
    prefix="/channels",
    tags=["channels"],
)
api_router.include_router(
    push_jobs.router,
    prefix="/push-jobs",
    tags=["push-jobs"],
)
