"""调度器进程入口：``python -m app.scheduler_main`` 或直接运行本文件。

将调用转发给 ``app.modules.scheduler`` 包内的 ``main``，用于独立进程
运行定时推送调度（与 API / Celery worker 分离部署时使用）。
"""

from app.modules.scheduler.__main__ import main

if __name__ == "__main__":
    main()
