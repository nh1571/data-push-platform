"""API tests for POST /push-jobs/{id}/run and GET /job-runs/{id}."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient

from app.plugins.base import DeliveryResult, Message, QueryResult
from app.plugins.registry import plugin_registry


def _create_source(client: TestClient) -> str:
    resp = client.post(
        "/api/v1/data-sources",
        json={
            "name": "run-ds",
            "type": "mysql",
            "config": {
                "host": "localhost",
                "port": 3306,
                "user": "u",
                "password": "p",
                "database": "db",
            },
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_channel(client: TestClient, name: str = "run-ch") -> str:
    resp = client.post(
        "/api/v1/channels",
        json={
            "name": name,
            "type": "dingtalk",
            "config": {"webhook_url": "https://example.com/hook"},
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_job(client: TestClient, ds_id: str, channel_ids: list[str]) -> str:
    resp = client.post(
        "/api/v1/push-jobs",
        json={
            "name": "runnable",
            "data_source_id": ds_id,
            "query_sql": "SELECT 1 AS n",
            "render_spec": {"type": "text_md"},
            "channel_ids": channel_ids,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


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
        return DeliveryResult(success=True, provider_msg_id="api-mock")


def test_run_push_job_creates_job_run_and_executes_sync(
    client: TestClient,
    monkeypatch: Any,
) -> None:
    """POST /push-jobs/{id}/run creates a JobRun and runs the pipeline when sync."""
    ds_id = _create_source(client)
    ch_id = _create_channel(client)
    job_id = _create_job(client, ds_id, [ch_id])

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
    # Ensure sync path for this test (settings default is True)
    from app.config import settings

    monkeypatch.setattr(settings, "execution_sync", True)

    resp = client.post(
        f"/api/v1/push-jobs/{job_id}/run",
        json={"params": {"biz_date": "2024-01-01"}, "trigger_type": "manual"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert "id" in body
    assert body["push_job_id"] == job_id
    assert body["status"] == "succeeded"
    assert body["trigger_type"] == "manual"
    assert body["params"] == {"biz_date": "2024-01-01"}
    run_id = body["id"]

    got = client.get(f"/api/v1/job-runs/{run_id}")
    assert got.status_code == 200, got.text
    detail = got.json()
    assert detail["id"] == run_id
    assert detail["status"] == "succeeded"
    assert detail["config_snapshot"] is not None
    assert detail["config_snapshot"]["name"] == "runnable"


def test_run_push_job_empty_body(client: TestClient, monkeypatch: Any) -> None:
    ds_id = _create_source(client)
    ch_id = _create_channel(client)
    job_id = _create_job(client, ds_id, [ch_id])

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

    resp = client.post(f"/api/v1/push-jobs/{job_id}/run")
    assert resp.status_code == 201, resp.text
    assert resp.json()["status"] == "succeeded"
    assert resp.json()["trigger_type"] == "manual"


def test_get_job_run_not_found(client: TestClient) -> None:
    resp = client.get(f"/api/v1/job-runs/{uuid4()}")
    assert resp.status_code == 404
