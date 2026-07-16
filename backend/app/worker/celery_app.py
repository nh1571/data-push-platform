"""Celery application for the data-push-platform worker."""

from __future__ import annotations

from celery import Celery

from app.config import settings

celery_app = Celery(
    "data_push_platform",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)
