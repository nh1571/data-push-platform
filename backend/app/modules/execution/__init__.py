"""任务执行模块：query → render → deliver 管线入口。"""

from app.modules.execution.pipeline import run_job_run

__all__ = ["run_job_run"]
