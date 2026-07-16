"""Auth login, JWT protection, and machine API token tests."""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.models import Operator
from app.modules.identity.security import (
    create_access_token,
    hash_api_token,
    hash_password,
    verify_password,
)


def test_login_success(unauth_client: TestClient, db_session: Session) -> None:
    op = Operator(username="alice", password_hash=hash_password("secret-pass"))
    db_session.add(op)
    db_session.commit()

    resp = unauth_client.post(
        "/api/v1/auth/login",
        json={"username": "alice", "password": "secret-pass"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert isinstance(body["access_token"], str)
    assert body["access_token"]


def test_login_wrong_password(unauth_client: TestClient, db_session: Session) -> None:
    op = Operator(username="bob", password_hash=hash_password("right"))
    db_session.add(op)
    db_session.commit()

    resp = unauth_client.post(
        "/api/v1/auth/login",
        json={"username": "bob", "password": "wrong"},
    )
    assert resp.status_code == 401


def test_protected_route_requires_auth(unauth_client: TestClient) -> None:
    resp = unauth_client.get("/api/v1/data-sources")
    assert resp.status_code == 401


def test_jwt_access_to_protected_route(
    unauth_client: TestClient,
    db_session: Session,
) -> None:
    op = Operator(username="jwt-user", password_hash=hash_password("pw"))
    db_session.add(op)
    db_session.commit()
    db_session.refresh(op)

    token = create_access_token(subject=op.id)
    resp = unauth_client.get(
        "/api/v1/data-sources",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_list_revoke_api_token(client: TestClient) -> None:
    created = client.post("/api/v1/api-tokens", json={"name": "ci-bot"})
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["name"] == "ci-bot"
    assert "token" in body
    assert body["token"]
    token_id = body["id"]
    plaintext = body["token"]

    listed = client.get("/api/v1/api-tokens")
    assert listed.status_code == 200
    items = listed.json()
    assert any(i["id"] == token_id for i in items)
    # plaintext must not appear in list
    for item in items:
        assert "token" not in item or item.get("token") is None

    revoked = client.delete(f"/api/v1/api-tokens/{token_id}")
    assert revoked.status_code == 204

    listed2 = client.get("/api/v1/api-tokens")
    match = next(i for i in listed2.json() if i["id"] == token_id)
    assert match["revoked_at"] is not None

    # machine token no longer accepted after revoke
    # (use unauth path: clear principal override is already on client —
    #  here we still have override; test machine auth separately)


def test_machine_token_auth(
    unauth_client: TestClient,
    db_session: Session,
) -> None:
    from app.db.models import ApiToken

    plaintext = "machine-secret-token-value-xyz"
    row = ApiToken(name="svc", token_hash=hash_api_token(plaintext))
    db_session.add(row)
    db_session.commit()

    ok = unauth_client.get(
        "/api/v1/data-sources",
        headers={"Authorization": f"Bearer {plaintext}"},
    )
    assert ok.status_code == 200

    bad = unauth_client.get(
        "/api/v1/data-sources",
        headers={"Authorization": "Bearer not-a-valid-token"},
    )
    assert bad.status_code == 401


def test_revoked_machine_token_rejected(
    unauth_client: TestClient,
    db_session: Session,
) -> None:
    from datetime import datetime, timezone

    from app.db.models import ApiToken

    plaintext = "revoked-token-abc"
    row = ApiToken(
        name="old",
        token_hash=hash_api_token(plaintext),
        revoked_at=datetime.now(timezone.utc),
    )
    db_session.add(row)
    db_session.commit()

    resp = unauth_client.get(
        "/api/v1/data-sources",
        headers={"Authorization": f"Bearer {plaintext}"},
    )
    assert resp.status_code == 401


def test_delete_unknown_api_token_404(client: TestClient) -> None:
    resp = client.delete(f"/api/v1/api-tokens/{uuid4()}")
    assert resp.status_code == 404


def test_password_hash_roundtrip() -> None:
    h = hash_password("admin123")
    assert verify_password("admin123", h)
    assert not verify_password("nope", h)


def test_ensure_bootstrap_admin_creates_when_empty(db_session: Session) -> None:
    from sqlalchemy import func, select

    from app.config import settings
    from app.modules.identity.bootstrap import ensure_bootstrap_admin

    for op in db_session.scalars(select(Operator)).all():
        db_session.delete(op)
    db_session.flush()

    created = ensure_bootstrap_admin(db_session)
    assert created is not None
    assert created.username == settings.admin_username
    assert verify_password(settings.admin_password, created.password_hash)

    again = ensure_bootstrap_admin(db_session)
    assert again is None
    count = db_session.scalar(select(func.count()).select_from(Operator))
    assert count == 1
