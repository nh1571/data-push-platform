"""Unit tests for the builtin cron scheduler tick()."""

from __future__ import annotations

from collections.abc import Generator
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.crypto import encrypt_dict, generate_fernet_key
from app.config import settings
from app.db.base import Base
from app.db.models import DataSource, JobRun, JobRunStatus, PushJob, TriggerType
from app.db.session import SessionLocal, engine
from app.modules.scheduler.runner import slot_for, tick
from app.plugins.base import DeliveryResult, Message, QueryResult
from app.plugins.registry import plugin_registry


@pytest.fixture()
def valid_fernet_key(monkeypatch: pytest.MonkeyPatch) -> str:
    key = generate_fernet_key()
    monkeypatch.setattr(settings, "token_fernet_key", key)
    return key


@pytest.fixture()
def db_session(valid_fernet_key: str) -> Generator[Session, None, None]:
    connection = engine.connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection, join_transaction_mode="create_savepoint")
    try:
        Base.metadata.create_all(bind=connection)
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


class _FakeDS:
    type = "mysql"

    def validate_config(self, config: dict[str, Any]) -> None:
        return None

    def execute(self, config: dict[str, Any], sql: str, params: dict[str, Any]) -> QueryResult:
        return QueryResult(columns=["n"], rows=[[1]])


class _FakeChannel:
    type = "dingtalk"

    def validate_config(self, config: dict[str, Any]) -> None:
        return None

    def send(self, config: dict[str, Any], message: Message) -> DeliveryResult:
        return DeliveryResult(success=True, provider_msg_id="sched-mock")


@pytest.fixture()
def fake_plugins(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_ds = _FakeDS()
    fake_ch = _FakeChannel()
    real_get = plugin_registry.get

    def _get(kind: str, type_name: str) -> Any:
        if kind == "datasource":
            return fake_ds
        if kind == "channel":
            return fake_ch
        return real_get(kind, type_name)

    monkeypatch.setattr(plugin_registry, "get", _get)
    monkeypatch.setattr(settings, "execution_sync", True)


def _seed_scheduled_job(
    db: Session,
    *,
    cron: str,
    schedule_enabled: bool = True,
    enabled: bool = True,
    last_slot: str | None = None,
) -> PushJob:
    ds = DataSource(
        name=f"ds-{uuid4().hex[:8]}",
        type="mysql",
        config_enc=encrypt_dict(
            {
                "host": "localhost",
                "port": 3306,
                "user": "u",
                "password": "p",
                "database": "db",
            }
        ),
    )
    db.add(ds)
    db.flush()

    # channel_ids can be empty for fire-check tests that still hit the pipeline;
    # pipeline needs a channel — create one if we will execute.
    from app.db.models import Channel

    ch = Channel(
        name=f"ch-{uuid4().hex[:8]}",
        type="dingtalk",
        config_enc=encrypt_dict({"webhook_url": "https://example.com/hook"}),
    )
    db.add(ch)
    db.flush()

    job = PushJob(
        name=f"job-{uuid4().hex[:8]}",
        enabled=enabled,
        data_source_id=ds.id,
        query_sql="SELECT 1 AS n",
        render_spec={"type": "text_md"},
        channel_ids=[str(ch.id)],
        schedule_cron=cron,
        schedule_enabled=schedule_enabled,
        last_schedule_slot=last_slot,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def test_slot_for_utc_minute() -> None:
    when = datetime(2024, 6, 15, 9, 30, 45, tzinfo=timezone.utc)
    assert slot_for(when) == "2024-06-15T09:30"


def test_tick_fires_matching_cron(
    db_session: Session,
    fake_plugins: None,
) -> None:
    """Every-minute cron at a fixed now creates one scheduled JobRun."""
    job = _seed_scheduled_job(db_session, cron="* * * * *")
    now = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

    run_ids = tick(db_session, now=now)

    assert len(run_ids) == 1
    db_session.refresh(job)
    assert job.last_schedule_slot == "2024-01-01T12:00"

    run = db_session.get(JobRun, run_ids[0])
    assert run is not None
    assert run.push_job_id == job.id
    assert run.trigger_type == TriggerType.SCHEDULE
    assert run.trigger_meta is not None
    assert run.trigger_meta["slot"] == "2024-01-01T12:00"
    # sync execution completed
    assert run.status == JobRunStatus.SUCCEEDED


def test_tick_no_double_fire_same_slot(
    db_session: Session,
    fake_plugins: None,
) -> None:
    job = _seed_scheduled_job(db_session, cron="* * * * *")
    now = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

    first = tick(db_session, now=now)
    second = tick(db_session, now=now)

    assert len(first) == 1
    assert second == []

    runs = db_session.scalars(
        select(JobRun).where(JobRun.push_job_id == job.id)
    ).all()
    assert len(runs) == 1


def test_tick_skips_non_matching_cron(
    db_session: Session,
    fake_plugins: None,
) -> None:
    """Hourly-at-0 cron should not fire at minute 15."""
    _seed_scheduled_job(db_session, cron="0 * * * *")
    now = datetime(2024, 1, 1, 12, 15, 0, tzinfo=timezone.utc)

    run_ids = tick(db_session, now=now)
    assert run_ids == []


def test_tick_skips_schedule_disabled(
    db_session: Session,
    fake_plugins: None,
) -> None:
    _seed_scheduled_job(db_session, cron="* * * * *", schedule_enabled=False)
    now = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    assert tick(db_session, now=now) == []


def test_tick_skips_job_disabled(
    db_session: Session,
    fake_plugins: None,
) -> None:
    _seed_scheduled_job(db_session, cron="* * * * *", enabled=False)
    now = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    assert tick(db_session, now=now) == []


def test_tick_fires_at_specific_minute(
    db_session: Session,
    fake_plugins: None,
) -> None:
    """Cron ``30 9 * * *`` matches only 09:30 UTC."""
    job = _seed_scheduled_job(db_session, cron="30 9 * * *")
    miss = datetime(2024, 3, 10, 9, 29, 0, tzinfo=timezone.utc)
    hit = datetime(2024, 3, 10, 9, 30, 0, tzinfo=timezone.utc)

    assert tick(db_session, now=miss) == []
    run_ids = tick(db_session, now=hit)
    assert len(run_ids) == 1
    db_session.refresh(job)
    assert job.last_schedule_slot == "2024-03-10T09:30"
