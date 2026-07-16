"""ORM model smoke tests against MySQL (or create_all fallback)."""

from collections.abc import Generator

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.models import Operator
from app.db.session import SessionLocal, engine


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    """Yield a transactional session rolled back after each test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)
    try:
        # Ensure schema exists (migrations preferred; create_all as safety net)
        Base.metadata.create_all(bind=connection)
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


def test_create_operator(db_session: Session) -> None:
    op = Operator(username="model-smoke-admin", password_hash="hashed-secret")
    db_session.add(op)
    db_session.flush()

    assert op.id is not None
    assert op.created_at is not None

    loaded = db_session.scalar(
        select(Operator).where(Operator.username == "model-smoke-admin")
    )
    assert loaded is not None
    assert loaded.username == "model-smoke-admin"
    assert loaded.password_hash == "hashed-secret"


def test_mysql_reachable() -> None:
    """Sanity: application engine can talk to the configured metadata MySQL."""
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        assert result.scalar_one() == 1
