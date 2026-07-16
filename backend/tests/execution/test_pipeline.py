"""Execution pipeline unit tests (datasource execute + channel send mocked)."""

from __future__ import annotations

from collections.abc import Generator
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.crypto import encrypt_dict, generate_fernet_key
from app.config import settings
from app.db.base import Base
from app.db.models import (
    Channel,
    DataSource,
    Delivery,
    DeliveryStatus,
    JobRun,
    JobRunLog,
    JobRunStatus,
    PushJob,
)
from app.db.session import SessionLocal, engine
from app.modules.execution.pipeline import run_job_run
from app.plugins.base import DeliveryResult, Message, QueryResult
from app.plugins.registry import plugin_registry
from app.plugins.renderer import register_builtin_renderers

# Ensure text_md renderer is available even when app.main is not imported.
register_builtin_renderers(plugin_registry)


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

    def __init__(self, result: QueryResult | None = None, error: Exception | None = None) -> None:
        self._result = result or QueryResult(columns=["id", "name"], rows=[[1, "a"]])
        self._error = error
        self.calls: list[tuple[Any, ...]] = []

    def validate_config(self, config: dict[str, Any]) -> None:
        return None

    def execute(self, config: dict[str, Any], sql: str, params: dict[str, Any]) -> QueryResult:
        self.calls.append((config, sql, params))
        if self._error is not None:
            raise self._error
        return self._result


class _FakeChannel:
    type = "dingtalk"

    def __init__(self, results: list[DeliveryResult] | None = None) -> None:
        self._results = list(results or [DeliveryResult(success=True, provider_msg_id="m1")])
        self.calls: list[tuple[dict[str, Any], Message]] = []
        self._i = 0

    def validate_config(self, config: dict[str, Any]) -> None:
        return None

    def send(self, config: dict[str, Any], message: Message) -> DeliveryResult:
        self.calls.append((config, message))
        if self._i < len(self._results):
            r = self._results[self._i]
        else:
            r = self._results[-1]
        self._i += 1
        return r


@pytest.fixture()
def fake_plugins(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Install fake datasource + channel on the process registry via monkeypatch."""
    ds = _FakeDS()
    ch = _FakeChannel()

    # text_md should already be registered by app import; ensure registry.get works
    real_get = plugin_registry.get

    def _get(kind: str, type_name: str) -> Any:
        if kind == "datasource":
            return ds
        if kind == "channel":
            return ch
        return real_get(kind, type_name)

    monkeypatch.setattr(plugin_registry, "get", _get)
    return {"ds": ds, "ch": ch}


def _seed_job(
    db: Session,
    *,
    channel_count: int = 1,
    skip_if_empty: bool = False,
    render_spec: Any | None = None,
    params: dict[str, Any] | None = None,
) -> JobRun:
    ds = DataSource(
        name="ds",
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

    channels: list[Channel] = []
    for i in range(channel_count):
        ch = Channel(
            name=f"ch-{i}",
            type="dingtalk",
            config_enc=encrypt_dict({"webhook_url": f"https://example.com/hook/{i}"}),
        )
        db.add(ch)
        channels.append(ch)
    db.flush()

    job = PushJob(
        name="job",
        enabled=True,
        skip_if_empty=skip_if_empty,
        data_source_id=ds.id,
        query_sql="SELECT 1 AS id, 'a' AS name",
        render_spec=render_spec if render_spec is not None else {"type": "text_md"},
        channel_ids=[str(c.id) for c in channels],
    )
    db.add(job)
    db.flush()

    run = JobRun(
        push_job_id=job.id,
        status=JobRunStatus.PENDING,
        trigger_type="manual",
        params=params,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def test_pipeline_success(db_session: Session, fake_plugins: dict[str, Any]) -> None:
    run = _seed_job(db_session)
    run_job_run(db_session, run.id)

    db_session.refresh(run)
    assert run.status == JobRunStatus.SUCCEEDED
    assert run.config_snapshot is not None
    assert run.config_snapshot["query_sql"]
    assert run.finished_at is not None
    assert run.error_message is None

    deliveries = list(
        db_session.scalars(select(Delivery).where(Delivery.job_run_id == run.id)).all()
    )
    assert len(deliveries) == 1
    assert deliveries[0].status == DeliveryStatus.SUCCESS
    assert deliveries[0].provider_msg_id == "m1"

    logs = list(
        db_session.scalars(select(JobRunLog).where(JobRunLog.job_run_id == run.id)).all()
    )
    steps = {log.step for log in logs}
    assert "start" in steps
    assert "query" in steps
    assert "render" in steps
    assert "deliver" in steps
    assert "finish" in steps

    # renderer produced a markdown text part that was sent
    assert len(fake_plugins["ch"].calls) == 1
    _cfg, msg = fake_plugins["ch"].calls[0]
    assert msg.parts
    assert msg.parts[0].kind == "text"
    assert "a" in str(msg.parts[0].content)


def test_pipeline_skip_if_empty(db_session: Session, fake_plugins: dict[str, Any]) -> None:
    fake_plugins["ds"]._result = QueryResult(columns=["id"], rows=[])
    run = _seed_job(db_session, skip_if_empty=True)
    run_job_run(db_session, run.id)

    db_session.refresh(run)
    assert run.status == JobRunStatus.SUCCEEDED
    assert run.finished_at is not None

    deliveries = list(
        db_session.scalars(select(Delivery).where(Delivery.job_run_id == run.id)).all()
    )
    assert deliveries == []
    assert fake_plugins["ch"].calls == []

    logs = list(
        db_session.scalars(select(JobRunLog).where(JobRunLog.job_run_id == run.id)).all()
    )
    assert any(log.step == "skip" for log in logs)


def test_pipeline_partial_when_one_channel_fails(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ds = _FakeDS()
    ch = _FakeChannel(
        results=[
            DeliveryResult(success=True, provider_msg_id="ok"),
            DeliveryResult(success=False, error="boom"),
        ]
    )
    real_get = plugin_registry.get

    def _get(kind: str, type_name: str) -> Any:
        if kind == "datasource":
            return ds
        if kind == "channel":
            return ch
        return real_get(kind, type_name)

    monkeypatch.setattr(plugin_registry, "get", _get)

    run = _seed_job(db_session, channel_count=2)
    run_job_run(db_session, run.id)

    db_session.refresh(run)
    assert run.status == JobRunStatus.PARTIAL
    assert run.error_message is not None
    assert "1 of 2" in run.error_message

    deliveries = list(
        db_session.scalars(
            select(Delivery)
            .where(Delivery.job_run_id == run.id)
            .order_by(Delivery.started_at)
        ).all()
    )
    assert len(deliveries) == 2
    statuses = {d.status for d in deliveries}
    assert DeliveryStatus.SUCCESS in statuses
    assert DeliveryStatus.FAILED in statuses


def test_pipeline_all_channels_fail(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    ds = _FakeDS()
    ch = _FakeChannel(results=[DeliveryResult(success=False, error="down")])
    real_get = plugin_registry.get

    def _get(kind: str, type_name: str) -> Any:
        if kind == "datasource":
            return ds
        if kind == "channel":
            return ch
        return real_get(kind, type_name)

    monkeypatch.setattr(plugin_registry, "get", _get)

    run = _seed_job(db_session, channel_count=1)
    run_job_run(db_session, run.id)
    db_session.refresh(run)
    assert run.status == JobRunStatus.FAILED


def test_pipeline_query_error(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    ds = _FakeDS(error=RuntimeError("sql failed"))
    ch = _FakeChannel()
    real_get = plugin_registry.get

    def _get(kind: str, type_name: str) -> Any:
        if kind == "datasource":
            return ds
        if kind == "channel":
            return ch
        return real_get(kind, type_name)

    monkeypatch.setattr(plugin_registry, "get", _get)

    run = _seed_job(db_session)
    run_job_run(db_session, run.id)
    db_session.refresh(run)
    assert run.status == JobRunStatus.FAILED
    assert "sql failed" in (run.error_message or "")
