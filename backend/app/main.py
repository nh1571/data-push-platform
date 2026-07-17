import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.config import settings
from app.db.session import SessionLocal
from app.modules.identity.bootstrap import ensure_bootstrap_admin
from app.plugins.channel import register_builtin_channels
from app.plugins.datasource import register_builtin_datasources
from app.plugins.registry import plugin_registry
from app.plugins.renderer import register_builtin_renderers

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """On startup: local bootstrap (optional) + admin user if empty."""
    from app.local_bootstrap import (
        ensure_local_runtime,
        ensure_schema,
        log_runtime_banner,
        seed_demo_datasource_if_empty,
    )

    # Local-first: dirs, fernet, demo biz DB. Safe no-op-ish for production
    # except ensure_schema may run alembic when auto_migrate=true.
    if settings.is_local_profile or settings.auto_migrate:
        ensure_local_runtime()
        ensure_schema()

    log_runtime_banner()

    db = SessionLocal()
    try:
        ensure_bootstrap_admin(db)
        if settings.is_local_profile:
            seed_demo_datasource_if_empty(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Data Push Platform", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Built-in plugins (idempotent re-register is fine for the process-wide registry)
register_builtin_datasources(plugin_registry)
register_builtin_renderers(plugin_registry)
register_builtin_channels(plugin_registry)

app.include_router(api_router)


@app.get("/health")
def health(detail: bool = Query(False, description="Include dependency profile")):
    body: dict = {"status": "ok", "app_env": settings.app_env}
    if detail:
        from app.local_bootstrap import health_deps

        body["deps"] = health_deps()
    return body
