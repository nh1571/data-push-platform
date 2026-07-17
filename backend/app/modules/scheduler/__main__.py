"""入口：``python -m app.modules.scheduler``。

每轮 tick 间隔约 20s：进程重启或慢 tick 仍能命中每个分钟槽至少一次；
同分钟防重依赖 ``PushJob.last_schedule_slot``。
"""

from __future__ import annotations

import logging
import sys
import time

from app.db.session import SessionLocal
from app.modules.scheduler.runner import tick_summary
from app.plugins.channel import register_builtin_channels
from app.plugins.datasource import register_builtin_datasources
from app.plugins.registry import plugin_registry
from app.plugins.renderer import register_builtin_renderers

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("app.modules.scheduler")

SLEEP_SECONDS = 20


def main() -> None:
    # execution_sync=True 时管线在进程内执行，需注册数据源/渲染/渠道插件
    register_builtin_datasources(plugin_registry)
    register_builtin_renderers(plugin_registry)
    register_builtin_channels(plugin_registry)

    logger.info("scheduler started (sleep=%ss)", SLEEP_SECONDS)
    while True:
        db = SessionLocal()
        try:
            summary = tick_summary(db)
            if summary["fired"]:
                logger.info("tick fired=%s slot=%s runs=%s", summary["fired"], summary["slot"], summary["run_ids"])
            else:
                logger.debug("tick idle slot=%s", summary["slot"])
        except Exception:  # noqa: BLE001
            logger.exception("tick failed")
        finally:
            db.close()
        time.sleep(SLEEP_SECONDS)


if __name__ == "__main__":
    main()
