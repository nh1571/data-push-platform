"""SQLAlchemy 声明式基类定义。

所有业务 ORM 模型应继承 ``Base``，以便 ``Base.metadata.create_all``
与 Alembic 能统一发现表结构。
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """全应用 ORM 模型的 SQLAlchemy declarative base。"""

    pass
