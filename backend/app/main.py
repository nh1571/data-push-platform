"""FastAPI 应用入口：生命周期钩子、CORS、内置插件注册与健康检查。

本模块创建全局 ``app`` 实例，在进程启动时完成：
- 本地环境的目录/密钥/Schema 引导（``local_bootstrap``）
- 空库时引导管理员账号
- 注册数据源 / 渲染器 / 通道等内置插件到进程级 ``plugin_registry``

生产环境依赖由环境变量与 ``.env`` 配置，不依赖本地演示引导逻辑。
"""

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
    """应用生命周期：启动时做本地引导与管理员种子，关闭时无额外清理。

    启动顺序：
    1. 本地 profile 或 ``auto_migrate`` 开启时：确保运行时目录、Fernet 密钥、表结构
    2. 打印运行时 banner（profile / DB / 同步执行开关）
    3. 引导默认管理员；本地再种子演示数据源

    Yield 之后 FastAPI 开始接收请求；当前实现在 yield 后无 shutdown 钩子。
    """
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

# 内置插件注册到进程级注册表；重复注册对当前实现是幂等/可接受的
register_builtin_datasources(plugin_registry)
register_builtin_renderers(plugin_registry)
register_builtin_channels(plugin_registry)

app.include_router(api_router)


@app.get("/health")
def health(detail: bool = Query(False, description="Include dependency profile")):
    """健康检查端点。

    默认仅返回 ``status=ok`` 与 ``app_env``。
    传入 ``detail=true`` 时附加依赖探测结果（DB 连通、Playwright 是否安装等）。
    """
    body: dict = {"status": "ok", "app_env": settings.app_env}
    if detail:
        from app.local_bootstrap import health_deps

        body["deps"] = health_deps()
    return body
