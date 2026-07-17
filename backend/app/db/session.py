from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings


def _build_engine() -> Engine:
    url = settings.database_url
    kwargs: dict = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        # SQLite: single-file meta DB for local/dev; allow multi-thread FastAPI
        kwargs = {
            "connect_args": {"check_same_thread": False},
            "pool_pre_ping": False,
        }
    engine = create_engine(url, **kwargs)

    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _sqlite_on_connect(dbapi_conn, _connection_record) -> None:  # type: ignore[no-untyped-def]
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


engine = _build_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a DB session and closes it after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def reset_engine() -> None:
    """Rebuild engine after settings change (tests)."""
    global engine, SessionLocal
    engine.dispose()
    engine = _build_engine()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
