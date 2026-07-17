"""操作员认证端点（登录 → JWT）。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Operator
from app.db.session import get_db
from app.modules.identity.schemas import LoginRequest, TokenResponse
from app.modules.identity.security import create_access_token, verify_password

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """校验操作员账号密码，返回 bearer access token。"""
    operator = db.scalar(select(Operator).where(Operator.username == body.username))
    if operator is None or not verify_password(body.password, operator.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(subject=operator.id)
    return TokenResponse(access_token=access_token, token_type="bearer")
