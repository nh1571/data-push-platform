"""Job execution pipeline (query → render → deliver)."""

from app.modules.execution.pipeline import run_job_run

__all__ = ["run_job_run"]
