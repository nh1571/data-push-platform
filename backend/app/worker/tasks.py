"""Celery 任务定义：异步执行一次 JobRun 流水线。

Worker 进程独立于 API 进程启动，因此必须在模块加载时再次注册内置插件
（数据源 / 渲染器 / 通道），否则 ``run_job_run`` 查找插件会失败。

同步模式（``EXECUTION_SYNC=true``）下 API 可直接调用流水线而不走本任务。
"""

from __future__ import annotations

from uuid import UUID

from app.db.session import SessionLocal
from app.modules.execution.pipeline import run_job_run
from app.plugins.channel import register_builtin_channels
from app.plugins.datasource import register_builtin_datasources
from app.plugins.registry import plugin_registry
from app.plugins.renderer import register_builtin_renderers
from app.worker.celery_app import celery_app

# 确保 worker 进程内插件已注册（与 API main 启动路径对称）
register_builtin_datasources(plugin_registry)
register_builtin_renderers(plugin_registry)
register_builtin_channels(plugin_registry)


@celery_app.task(name="app.worker.tasks.run_job_run_task", bind=True)
def run_job_run_task(self, job_run_id: str) -> dict[str, str]:  # noqa: ARG001
    """异步执行指定 JobRun。

    参数
    ----------
    job_run_id:
        待执行 JobRun 行的 UUID 字符串。

    返回
    -------
    dict
        含 ``job_run_id`` 与 ``status=done``（流水线内部失败会写库，此处仍返回 done
        表示任务本身已跑完；具体成功/失败看 JobRun.status）。
    """
    run_job_run(SessionLocal, UUID(job_run_id))
    return {"job_run_id": job_run_id, "status": "done"}
