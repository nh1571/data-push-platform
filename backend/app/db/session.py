"""数据库引擎与 Session 工厂。

根据 ``settings.database_url`` 创建全局 ``engine`` 与 ``SessionLocal``：
- SQLite（本地）：关闭同线程检查、开启外键 PRAGMA
- MySQL 等外部库：``pool_pre_ping`` 保活连接

``get_db`` 供 FastAPI 依赖注入；``reset_engine`` 供测试在改配置后重建引擎。
"""

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings


def _build_engine() -> Engine:
    """按当前 settings 构建 SQLAlchemy Engine（含 SQLite 特殊参数）。"""
    url = settings.database_url
    kwargs: dict = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        # SQLite：本地/开发用单文件元数据库；允许多线程 FastAPI 共用连接
        kwargs = {
            "connect_args": {"check_same_thread": False},
            "pool_pre_ping": False,
        }
    engine = create_engine(url, **kwargs)

    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _sqlite_on_connect(dbapi_conn, _connection_record) -> None:  # type: ignore[no-untyped-def]
            # 每次新连接启用外键约束（SQLite 默认关闭）
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


engine = _build_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI 依赖：yield 一个 DB Session，请求结束后关闭。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def reset_engine() -> None:
    """配置变更后重建 engine / SessionLocal（主要用于测试）。"""
    global engine, SessionLocal
    engine.dispose()
    engine = _build_engine()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
