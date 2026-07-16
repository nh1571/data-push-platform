"""Channel CRUD API tests."""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient


def test_create_list_get_delete_channel(client: TestClient) -> None:
    payload = {
        "name": "ops-dingtalk",
        "type": "dingtalk",
        "config": {
            "webhook_url": "https://oapi.dingtalk.com/robot/send?access_token=abc",
            "secret": "sec-value",
        },
    }
    created = client.post("/api/v1/channels", json=payload)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["name"] == "ops-dingtalk"
    assert body["type"] == "dingtalk"
    assert body["config"]["webhook_url"].startswith("https://")
    assert body["config"]["secret"] == "******"
    channel_id = body["id"]

    listed = client.get("/api/v1/channels")
    assert listed.status_code == 200
    assert channel_id in {item["id"] for item in listed.json()}

    got = client.get(f"/api/v1/channels/{channel_id}")
    assert got.status_code == 200
    assert got.json()["id"] == channel_id

    deleted = client.delete(f"/api/v1/channels/{channel_id}")
    assert deleted.status_code == 204

    assert client.get(f"/api/v1/channels/{channel_id}").status_code == 404


def test_test_channel_valid_config(client: TestClient) -> None:
    created = client.post(
        "/api/v1/channels",
        json={
            "name": "bot",
            "type": "dingtalk",
            "config": {"access_token": "tok-123"},
        },
    )
    channel_id = created.json()["id"]

    resp = client.post(f"/api/v1/channels/{channel_id}/test")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_test_channel_invalid_config(client: TestClient) -> None:
    created = client.post(
        "/api/v1/channels",
        json={"name": "empty-bot", "type": "dingtalk", "config": {}},
    )
    channel_id = created.json()["id"]

    resp = client.post(f"/api/v1/channels/{channel_id}/test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "webhook_url or access_token" in (body["message"] or "")


def test_test_channel_unknown_type_400(client: TestClient) -> None:
    created = client.post(
        "/api/v1/channels",
        json={"name": "x", "type": "nope", "config": {"a": 1}},
    )
    channel_id = created.json()["id"]
    resp = client.post(f"/api/v1/channels/{channel_id}/test")
    assert resp.status_code == 400
    assert "unknown channel type" in resp.json()["detail"]


def test_get_unknown_channel_404(client: TestClient) -> None:
    assert client.get(f"/api/v1/channels/{uuid4()}").status_code == 404
