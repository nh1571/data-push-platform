"""共享 FastAPI 依赖项：从 identity 模块再导出，便于路由侧统一导入。

使用方式示例::

    from app.deps import Principal, get_current_principal
"""

from app.modules.identity.deps import get_current_principal
from app.modules.identity.schemas import Principal

__all__ = ["Principal", "get_current_principal"]
