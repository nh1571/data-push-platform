"""PushJob CRUD API tests (links data source + channels)."""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient


def _create_source(client: TestClient) -> str:
    resp = client.post(
        "/api/v1/data-sources",
        json={
            "name": "job-ds",
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


def _create_channel(client: TestClient, name: str = "job-ch") -> str:
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


def test_create_list_get_update_delete_push_job(client: TestClient) -> None:
    ds_id = _create_source(client)
    ch_id = _create_channel(client)

    payload = {
        "name": "daily-orders",
        "enabled": True,
        "skip_if_empty": True,
        "data_source_id": ds_id,
        "query_sql": "SELECT 1 AS n",
        "render_spec": {"type": "markdown_table", "title": "Orders"},
        "channel_ids": [ch_id],
        "schedule_cron": "0 9 * * *",
        "schedule_enabled": True,
    }
    created = client.post("/api/v1/push-jobs", json=payload)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["name"] == "daily-orders"
    assert body["data_source_id"] == ds_id
    assert body["channel_ids"] == [ch_id]
    assert body["skip_if_empty"] is True
    assert body["schedule_cron"] == "0 9 * * *"
    job_id = body["id"]

    listed = client.get("/api/v1/push-jobs")
    assert listed.status_code == 200
    assert job_id in {item["id"] for item in listed.json()}

    got = client.get(f"/api/v1/push-jobs/{job_id}")
    assert got.status_code == 200
    assert got.json()["query_sql"] == "SELECT 1 AS n"

    updated = client.put(
        f"/api/v1/push-jobs/{job_id}",
        json={"name": "daily-orders-v2", "enabled": False},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "daily-orders-v2"
    assert updated.json()["enabled"] is False

    deleted = client.delete(f"/api/v1/push-jobs/{job_id}")
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/push-jobs/{job_id}").status_code == 404


def test_create_push_job_missing_data_source(client: TestClient) -> None:
    ch_id = _create_channel(client)
    resp = client.post(
        "/api/v1/push-jobs",
        json={
            "name": "bad",
            "data_source_id": str(uuid4()),
            "query_sql": "SELECT 1",
            "render_spec": {},
            "channel_ids": [ch_id],
        },
    )
    assert resp.status_code == 400
    assert "data_source_id not found" in resp.json()["detail"]


def test_create_push_job_missing_channel(client: TestClient) -> None:
    ds_id = _create_source(client)
    resp = client.post(
        "/api/v1/push-jobs",
        json={
            "name": "bad",
            "data_source_id": ds_id,
            "query_sql": "SELECT 1",
            "render_spec": {},
            "channel_ids": [str(uuid4())],
        },
    )
    assert resp.status_code == 400
    assert "channel_ids not found" in resp.json()["detail"]


def test_create_push_job_links_source_and_channels(client: TestClient) -> None:
    ds_id = _create_source(client)
    ch1 = _create_channel(client, name="ch-a")
    ch2 = _create_channel(client, name="ch-b")

    resp = client.post(
        "/api/v1/push-jobs",
        json={
            "name": "multi-ch",
            "data_source_id": ds_id,
            "query_sql": "SELECT id FROM t",
            "render_spec": [{"type": "markdown_table"}],
            "channel_ids": [ch1, ch2],
            "schedule_enabled": False,
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert set(body["channel_ids"]) == {ch1, ch2}
    assert body["render_spec"] == [{"type": "markdown_table"}]
