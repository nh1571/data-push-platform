"""Celery 应用实例：data-push-platform 异步 worker 入口配置。

使用 ``settings.redis_url`` 同时作为 broker 与 result backend；
任务模块通过 ``include`` 自动加载 ``app.worker.tasks``。

启动示例（生产）::

    celery -A app.worker.celery_app.celery_app worker -l info
"""

from __future__ import annotations

from celery import Celery

from app.config import settings

celery_app = Celery(
    "data_push_platform",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.worker.tasks"],
)

# JSON 序列化 + UTC，便于跨进程传递 job_run_id 等简单参数
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)
