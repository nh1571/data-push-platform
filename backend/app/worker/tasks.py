"""Celery tasks for job execution."""

from __future__ import annotations

from uuid import UUID

from app.db.session import SessionLocal
from app.modules.execution.pipeline import run_job_run
from app.plugins.channel import register_builtin_channels
from app.plugins.datasource import register_builtin_datasources
from app.plugins.registry import plugin_registry
from app.plugins.renderer import register_builtin_renderers
from app.worker.celery_app import celery_app

# Ensure plugins are registered in the worker process.
register_builtin_datasources(plugin_registry)
register_builtin_renderers(plugin_registry)
register_builtin_channels(plugin_registry)


@celery_app.task(name="app.worker.tasks.run_job_run_task", bind=True)
def run_job_run_task(self, job_run_id: str) -> dict[str, str]:  # noqa: ARG001
    """Execute a job run asynchronously.

    Parameters
    ----------
    job_run_id:
        UUID string of the JobRun row to execute.
    """
    run_job_run(SessionLocal, UUID(job_run_id))
    return {"job_run_id": job_run_id, "status": "done"}
