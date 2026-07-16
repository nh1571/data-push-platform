from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.config import settings
from app.db.session import SessionLocal
from app.modules.identity.bootstrap import ensure_bootstrap_admin
from app.plugins.channel import register_builtin_channels
from app.plugins.datasource import register_builtin_datasources
from app.plugins.registry import plugin_registry


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """On startup: bootstrap default admin if no operators exist."""
    db = SessionLocal()
    try:
        ensure_bootstrap_admin(db)
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
register_builtin_channels(plugin_registry)

app.include_router(api_router)


@app.get("/health")
def health():
    return {"status": "ok"}
