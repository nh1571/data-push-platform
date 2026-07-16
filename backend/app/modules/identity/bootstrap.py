"""Bootstrap default admin operator when none exist."""

from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import Operator
from app.modules.identity.security import hash_password

logger = logging.getLogger(__name__)


def ensure_bootstrap_admin(db: Session) -> Operator | None:
    """If the operators table is empty, create admin from env settings.

    Returns the created operator, or ``None`` if operators already exist.
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
