"""Editor API tests (query-preview / message-preview / test-push / save-job)."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock
from uuid import uuid4

from fastapi.testclient import TestClient

from app.plugins.base import DeliveryResult, QueryResult
from app.plugins.registry import plugin_registry


def _create_source(client: TestClient) -> str:
    resp = client.post(
        "/api/v1/data-sources",
        json={
            "name": "editor-ds",
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


def _create_channel(client: TestClient, name: str = "editor-ch") -> str:
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


class _FakeDS:
    type = "mysql"

    def __init__(self) -> None:
        self.calls: list[tuple[Any, ...]] = []

    def validate_config(self, config: dict[str, Any]) -> None:
        return None

    def execute(
        self,
        config: dict[str, Any],
        sql: str,
        params: dict[str, Any],
    ) -> QueryResult:
        self.calls.append((config, sql, params))
        return QueryResult(
            columns=["name", "amount"],
            rows=[["Alice", 10], ["Bob", 20], ["Carol", 30]],
        )


class _FakeChannel:
    type = "dingtalk"

    def __init__(self) -> None:
        self.calls: list[Any] = []

    def validate_config(self, config: dict[str, Any]) -> None:
        return None

    def send(self, config: dict[str, Any], message: Any) -> DeliveryResult:
        self.calls.append((config, message))
        return DeliveryResult(success=True, provider_msg_id="msg-editor-1")


def _install_fakes(monkeypatch: Any) -> dict[str, Any]:
    ds = _FakeDS()
    ch = _FakeChannel()
    real_get = plugin_registry.get

    def _get(kind: str, type_name: str) -> Any:
        if kind == "datasource":
            return ds
        if kind == "channel":
            return ch
        return real_get(kind, type_name)

    monkeypatch.setattr(plugin_registry, "get", _get)
    return {"ds": ds, "ch": ch}


def test_query_preview(client: TestClient, monkeypatch: Any) -> None:
    fakes = _install_fakes(monkeypatch)
    ds_id = _create_source(client)

    resp = client.post(
        "/api/v1/editor/query-preview",
        json={
            "data_source_id": ds_id,
            "sql": "SELECT name, amount FROM t",
            "params": {},
            "max_rows": 2,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["columns"] == ["name", "amount"]
    assert body["row_count"] == 2  # max_rows enforced
    assert len(body["rows"]) == 2
    assert fakes["ds"].calls
    assert fakes["ds"].calls[0][1] == "SELECT name, amount FROM t"


def test_query_preview_missing_source(client: TestClient, monkeypatch: Any) -> None:
    _install_fakes(monkeypatch)
    resp = client.post(
        "/api/v1/editor/query-preview",
        json={
            "data_source_id": str(uuid4()),
            "sql": "SELECT 1",
        },
    )
    assert resp.status_code == 400


def test_message_preview(client: TestClient, monkeypatch: Any) -> None:
    _install_fakes(monkeypatch)
    ds_id = _create_source(client)

    resp = client.post(
        "/api/v1/editor/message-preview",
        json={
            "data_source_id": ds_id,
            "sql": "SELECT name, amount FROM t",
            "design": {
                "header_text": "日报 — {{name}}",
                "footer_text": "end",
                "include_markdown_table": True,
            },
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "Alice" in body["markdown_text"]
    assert "日报 — Alice" in body["markdown_text"]
    assert body["parts"]
    assert body["parts"][0]["kind"] == "text"


def test_test_push(client: TestClient, monkeypatch: Any) -> None:
    fakes = _install_fakes(monkeypatch)
    ds_id = _create_source(client)
    ch_id = _create_channel(client)

    resp = client.post(
        "/api/v1/editor/test-push",
        json={
            "data_source_id": ds_id,
            "sql": "SELECT name, amount FROM t",
            "design": {"header_text": "push {{name}}", "include_markdown_table": True},
            "channel_ids": [ch_id],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert body["row_count"] == 3
    assert len(body["deliveries"]) == 1
    assert body["deliveries"][0]["success"] is True
    assert body["job_run_id"] is None
    assert fakes["ch"].calls


def test_test_push_with_job_run_audit(client: TestClient, monkeypatch: Any) -> None:
    _install_fakes(monkeypatch)
    ds_id = _create_source(client)
    ch_id = _create_channel(client)

    # Save a job first so we have push_job_id for FK
    saved = client.post(
        "/api/v1/editor/save-job",
        json={
            "name": "audit-job",
            "data_source_id": ds_id,
            "query_sql": "SELECT name, amount FROM t",
            "design": {"header_text": "H"},
            "channel_ids": [ch_id],
        },
    )
    assert saved.status_code == 200, saved.text
    job_id = saved.json()["id"]

    resp = client.post(
        "/api/v1/editor/test-push",
        json={
            "data_source_id": ds_id,
            "sql": "SELECT name, amount FROM t",
            "design": {"header_text": "H"},
            "channel_ids": [ch_id],
            "push_job_id": job_id,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert body["job_run_id"] is not None


def test_save_job_create_and_update(client: TestClient, monkeypatch: Any) -> None:
    _install_fakes(monkeypatch)
    ds_id = _create_source(client)
    ch_id = _create_channel(client)

    created = client.post(
        "/api/v1/editor/save-job",
        json={
            "name": "editor-job",
            "data_source_id": ds_id,
            "query_sql": "SELECT 1 AS n",
            "design": {
                "header_text": "Hello",
                "include_markdown_table": True,
                "extra_parts": [],
            },
            "channel_ids": [ch_id],
            "skip_if_empty": True,
            "enabled": True,
        },
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["name"] == "editor-job"
    assert "design" in body["render_spec"]
    assert body["render_spec"]["design"]["header_text"] == "Hello"
    assert "parts" in body["render_spec"]
    job_id = body["id"]

    updated = client.post(
        "/api/v1/editor/save-job",
        json={
            "id": job_id,
            "name": "editor-job-v2",
            "data_source_id": ds_id,
            "query_sql": "SELECT 2 AS n",
            "design": {"header_text": "V2", "include_markdown_table": False},
            "channel_ids": [ch_id],
            "enabled": False,
        },
    )
    assert updated.status_code == 200, updated.text
    ubody = updated.json()
    assert ubody["id"] == job_id
    assert ubody["name"] == "editor-job-v2"
    assert ubody["enabled"] is False
    assert ubody["render_spec"]["design"]["header_text"] == "V2"
    assert ubody["query_sql"] == "SELECT 2 AS n"


def test_editor_requires_auth(unauth_client: TestClient) -> None:
    resp = unauth_client.post(
        "/api/v1/editor/query-preview",
        json={"data_source_id": str(uuid4()), "sql": "SELECT 1"},
    )
    assert resp.status_code in (401, 403)
