"""聚合 API v1 路由（前缀 ``/api/v1``）。

除 ``POST /api/v1/auth/login`` 外，均依赖
:func:`~app.deps.get_current_principal` 鉴权。
"""

from fastapi import APIRouter, Depends

from app.api.v1 import api_tokens, auth, channels, data_sources, editor, identities, job_runs, push_jobs, push_targets, recipient_groups
from app.deps import get_current_principal

api_router = APIRouter(prefix="/api/v1")

# 公开鉴权路由（无需 Principal）
api_router.include_router(
    auth.router,
    prefix="/auth",
    tags=["auth"],
)

# 受保护的资源路由
_protected = [Depends(get_current_principal)]

api_router.include_router(
    data_sources.router,
    prefix="/data-sources",
    tags=["data-sources"],
    dependencies=_protected,
)
api_router.include_router(
    channels.router,
    prefix="/channels",
    tags=["channels"],
    dependencies=_protected,
)
api_router.include_router(
    push_jobs.router,
    prefix="/push-jobs",
    tags=["push-jobs"],
    dependencies=_protected,
)
api_router.include_router(
    job_runs.router,
    prefix="/job-runs",
    tags=["job-runs"],
    dependencies=_protected,
)
api_router.include_router(
    api_tokens.router,
    prefix="/api-tokens",
    tags=["api-tokens"],
    dependencies=_protected,
)
api_router.include_router(
    editor.router,
    prefix="/editor",
    tags=["editor"],
    dependencies=_protected,
)
api_router.include_router(
    identities.router,
    prefix="/identities",
    tags=["identities"],
    dependencies=_protected,
)
api_router.include_router(
    push_targets.router,
    prefix="/push-targets",
    tags=["push-targets"],
    dependencies=_protected,
)
api_router.include_router(
    recipient_groups.router,
    prefix="/recipient-groups",
    tags=["recipient-groups"],
    dependencies=_protected,
)
