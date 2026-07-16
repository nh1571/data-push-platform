"""Entry point: ``python -m app.modules.scheduler``.

Sleeps ~20s between ticks so a process restart or slow tick still hits each
minute slot at least once (double-fire guarded by ``last_schedule_slot``).
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
    # Plugins needed when execution_sync=True runs the pipeline in-process.
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
