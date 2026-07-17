"""当 operators 表为空时，从环境配置引导创建默认管理员。"""

from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import Operator
from app.modules.identity.security import hash_password

logger = logging.getLogger(__name__)


def ensure_bootstrap_admin(db: Session) -> Operator | None:
    """operators 为空时，按 settings.admin_username/password 创建管理员。

    返回新建 Operator；若已有操作员则返回 ``None``。
    """
    count = db.scalar(select(func.count()).select_from(Operator)) or 0
    if count > 0:
        return None

    username = settings.admin_username
    password = settings.admin_password
    operator = Operator(
        username=username,
        password_hash=hash_password(password),
    )
    db.add(operator)
    db.commit()
    db.refresh(operator)
    logger.info("Bootstrapped admin operator username=%s", username)
    return operator
