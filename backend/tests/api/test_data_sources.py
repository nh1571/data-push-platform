"""DataSource CRUD API tests."""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient


def test_create_list_get_delete_data_source(client: TestClient) -> None:
    payload = {
        "name": "orders-mysql",
        "type": "mysql",
        "config": {
            "host": "localhost",
            "port": 3306,
            "user": "root",
            "password": "s3cret",
            "database": "orders",
        },
    }
    created = client.post("/api/v1/data-sources", json=payload)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["name"] == "orders-mysql"
    assert body["type"] == "mysql"
    assert body["config"]["password"] == "******"
    assert body["config"]["host"] == "localhost"
    source_id = body["id"]

    listed = client.get("/api/v1/data-sources")
    assert listed.status_code == 200
    ids = {item["id"] for item in listed.json()}
    assert source_id in ids

    got = client.get(f"/api/v1/data-sources/{source_id}")
    assert got.status_code == 200
    assert got.json()["id"] == source_id
    assert got.json()["config"]["password"] == "******"

    deleted = client.delete(f"/api/v1/data-sources/{source_id}")
    assert deleted.status_code == 204

    missing = client.get(f"/api/v1/data-sources/{source_id}")
    assert missing.status_code == 404


def test_update_data_source(client: TestClient) -> None:
    created = client.post(
        "/api/v1/data-sources",
        json={
            "name": "ds1",
            "type": "mysql",
            "config": {"host": "h1", "port": 3306, "user": "u", "password": "p", "database": "d"},
        },
    )
    source_id = created.json()["id"]

    updated = client.put(
        f"/api/v1/data-sources/{source_id}",
        json={"name": "ds1-renamed", "config": {"host": "h2", "port": 3306, "user": "u", "password": "new", "database": "d"}},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "ds1-renamed"
    assert updated.json()["config"]["host"] == "h2"
    assert updated.json()["config"]["password"] == "******"


def test_get_unknown_data_source_404(client: TestClient) -> None:
    resp = client.get(f"/api/v1/data-sources/{uuid4()}")
    assert resp.status_code == 404


def test_test_endpoint_unknown_type_400(client: TestClient) -> None:
    created = client.post(
        "/api/v1/data-sources",
        json={"name": "weird", "type": "not-a-real-plugin", "config": {"x": 1}},
    )
    assert created.status_code == 201
    source_id = created.json()["id"]

    resp = client.post(f"/api/v1/data-sources/{source_id}/test")
    assert resp.status_code == 400
    assert "unknown data source type" in resp.json()["detail"]


def test_test_endpoint_validate_fails_ok_false(client: TestClient) -> None:
    """Registered type with invalid config should return ok=false (not 400)."""
    created = client.post(
        "/api/v1/data-sources",
        json={"name": "bad-mysql", "type": "mysql", "config": {"host": "localhost"}},
    )
    source_id = created.json()["id"]

    resp = client.post(f"/api/v1/data-sources/{source_id}/test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "missing required config keys" in (body["message"] or "")
