"""Builtin minute-level cron scheduler for push jobs."""

from app.modules.scheduler.runner import slot_for, tick

__all__ = ["slot_for", "tick"]
