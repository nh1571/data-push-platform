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
    assert isinstance(detail.get("deliveries"), list)
    assert isinstance(detail.get("logs"), list)
    assert len(detail["deliveries"]) >= 1
    assert len(detail["logs"]) >= 1


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


def _install_fake_plugins(monkeypatch: Any) -> None:
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
    from app.config import settings

    monkeypatch.setattr(settings, "execution_sync", True)


def test_list_job_runs_filters(client: TestClient, monkeypatch: Any) -> None:
    """GET /job-runs supports status, push_job_id, trigger_type, limit, offset."""
    _install_fake_plugins(monkeypatch)
    ds_id = _create_source(client)
    ch_id = _create_channel(client)
    job_a = _create_job(client, ds_id, [ch_id])
    # second job for push_job_id filter isolation
    resp_b = client.post(
        "/api/v1/push-jobs",
        json={
            "name": "other-job",
            "data_source_id": ds_id,
            "query_sql": "SELECT 2 AS n",
            "render_spec": {"type": "text_md"},
            "channel_ids": [ch_id],
        },
    )
    assert resp_b.status_code == 201
    job_b = resp_b.json()["id"]

    r1 = client.post(f"/api/v1/push-jobs/{job_a}/run", json={"trigger_type": "manual"})
    r2 = client.post(f"/api/v1/push-jobs/{job_b}/run", json={"trigger_type": "api"})
    assert r1.status_code == 201
    assert r2.status_code == 201

    all_runs = client.get("/api/v1/job-runs")
    assert all_runs.status_code == 200
    assert len(all_runs.json()) >= 2

    by_job = client.get(f"/api/v1/job-runs?push_job_id={job_a}")
    assert by_job.status_code == 200
    body = by_job.json()
    assert len(body) == 1
    assert body[0]["push_job_id"] == job_a
    assert body[0]["trigger_type"] == "manual"

    by_trigger = client.get("/api/v1/job-runs?trigger_type=api")
    assert by_trigger.status_code == 200
    assert all(x["trigger_type"] == "api" for x in by_trigger.json())
    assert any(x["push_job_id"] == job_b for x in by_trigger.json())

    by_status = client.get("/api/v1/job-runs?status=succeeded")
    assert by_status.status_code == 200
    assert all(x["status"] == "succeeded" for x in by_status.json())

    limited = client.get("/api/v1/job-runs?limit=1&offset=0")
    assert limited.status_code == 200
    assert len(limited.json()) == 1


def test_rerun_creates_new_run_with_parent(
    client: TestClient,
    monkeypatch: Any,
) -> None:
    """POST /job-runs/{id}/rerun creates a new run with parent_run_id and trigger_type=rerun."""
    _install_fake_plugins(monkeypatch)
    ds_id = _create_source(client)
    ch_id = _create_channel(client)
    job_id = _create_job(client, ds_id, [ch_id])

    parent_resp = client.post(
        f"/api/v1/push-jobs/{job_id}/run",
        json={"params": {"biz_date": "2024-06-01"}, "trigger_type": "manual"},
    )
    assert parent_resp.status_code == 201
    parent = parent_resp.json()
    parent_id = parent["id"]

    rerun_resp = client.post(f"/api/v1/job-runs/{parent_id}/rerun")
    assert rerun_resp.status_code == 201, rerun_resp.text
    child = rerun_resp.json()
    assert child["id"] != parent_id
    assert child["parent_run_id"] == parent_id
    assert child["trigger_type"] == "rerun"
    assert child["push_job_id"] == job_id
    assert child["params"] == {"biz_date": "2024-06-01"}
    assert child["status"] == "succeeded"
    # pipeline snapshots latest job config
    assert child["config_snapshot"] is not None
    assert child["config_snapshot"]["name"] == "runnable"


def test_rerun_not_found(client: TestClient) -> None:
    resp = client.post(f"/api/v1/job-runs/{uuid4()}/rerun")
    assert resp.status_code == 404
