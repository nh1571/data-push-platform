"""插件框架：数据源、渲染器与投递通道的协议、注册表与再导出。

执行流水线通过 ``plugin_registry`` 按 type 名查找具体实现；
内置插件在 API / worker 启动时注册。
"""

from app.plugins.base import (
    ChannelPlugin,
    DataSourcePlugin,
    DeliveryResult,
    Message,
    MessagePart,
    QueryResult,
    RendererPlugin,
)
from app.plugins.registry import PluginRegistry, plugin_registry

__all__ = [
    "ChannelPlugin",
    "DataSourcePlugin",
    "DeliveryResult",
    "Message",
    "MessagePart",
    "PluginRegistry",
    "QueryResult",
    "RendererPlugin",
    "plugin_registry",
]
