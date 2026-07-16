"""Shared fixtures for config CRUD API tests (real Postgres + Fernet key + auth)."""

from __future__ import annotations

from collections.abc import Generator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.common.crypto import generate_fernet_key
from app.config import settings
from app.db.base import Base
from app.db.session import SessionLocal, engine, get_db
from app.deps import get_current_principal
from app.main import app
from app.modules.identity.schemas import Principal


@pytest.fixture()
def valid_fernet_key(monkeypatch: pytest.MonkeyPatch) -> str:
    """Install a valid Fernet key for encrypt/decrypt during API tests."""
    key = generate_fernet_key()
    monkeypatch.setattr(settings, "token_fernet_key", key)
    return key


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    """Transactional session rolled back after each test (savepoint-aware)."""
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


@pytest.fixture()
def auth_principal() -> Principal:
    """Fake authenticated operator principal used by protected API tests."""
    return Principal(kind="user", operator_id=uuid4(), username="test-admin")


@pytest.fixture()
def client(
    valid_fernet_key: str,
    db_session: Session,
    auth_principal: Principal,
) -> Generator[TestClient, None, None]:
    """TestClient with DB + auth overrides so API tests need no real login."""

    def _override_get_db() -> Generator[Session, None, None]:
        try:
            yield db_session
        finally:
            pass

    def _override_principal() -> Principal:
        return auth_principal

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_principal] = _override_principal
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def unauth_client(
    valid_fernet_key: str,
    db_session: Session,
) -> Generator[TestClient, None, None]:
    """TestClient with DB override only — no auth principal (for 401 checks)."""

    def _override_get_db() -> Generator[Session, None, None]:
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    # Ensure any previous principal override is gone
    app.dependency_overrides.pop(get_current_principal, None)
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
