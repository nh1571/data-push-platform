"""插件协议与数据契约：数据源、渲染器、通道三层。

数据流概览::

    DataSourcePlugin.execute  → QueryResult
    RendererPlugin.render     → list[MessagePart] → Message
    ChannelPlugin.send        → DeliveryResult

实现类无需继承 ABC，只需满足对应 Protocol 的结构（duck typing），
注册表通过 ``execute`` / ``render`` / ``send`` 方法推断插件种类。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


@dataclass
class QueryResult:
    """数据源查询返回的表格结果。

    属性
    ----------
    columns:
        列名列表。
    rows:
        二维行数据，每行与 columns 对齐的单元格值列表。
    """

    columns: list[str]
    rows: list[list[Any]]


@dataclass
class MessagePart:
    """推送消息的一个片段（文本、图片、文件、卡片等）。

    属性
    ----------
    kind:
        片段类型：``text`` | ``image`` | ``file`` | ``card`` 等。
    content:
        载荷：字符串、dict（含 path/url）或路径类对象，依 kind 而定。
    """

    kind: str
    content: Any  # dict | str | path-like


@dataclass
class Message:
    """由一个或多个 MessagePart 组成的出站消息。"""

    parts: list[MessagePart] = field(default_factory=list)


@dataclass
class DeliveryResult:
    """通道插件发送结果。

    属性
    ----------
    success:
        是否投递成功。
    provider_msg_id:
        上游消息/任务 id（可选，用于对账）。
    error:
        失败时的错误说明（可选）。
    """

    success: bool
    provider_msg_id: str | None = None
    error: str | None = None


@runtime_checkable
class DataSourcePlugin(Protocol):
    """查询后端协议（MySQL、HTTP API、SQLite 等）。"""

    @property
    def type(self) -> str:
        """唯一类型 id，例如 ``mysql``。"""
        ...

    def validate_config(self, config: dict[str, Any]) -> None:
        """配置非法时抛出异常。"""
        ...

    def execute(
        self,
        config: dict[str, Any],
        sql: str,
        params: dict[str, Any],
    ) -> QueryResult:
        """执行参数化查询并返回表格行。"""
        ...


@runtime_checkable
class RendererPlugin(Protocol):
    """将 QueryResult 转为消息片段（Markdown 表、图片表、导出文件等）。"""

    @property
    def type(self) -> str:
        """唯一类型 id，例如 ``markdown_table`` / ``text_md``。"""
        ...

    def render(
        self,
        result: QueryResult,
        config: dict[str, Any],
        params: dict[str, Any],
    ) -> list[MessagePart]:
        """渲染查询结果为 MessagePart 列表。"""
        ...


@runtime_checkable
class ChannelPlugin(Protocol):
    """将 Message 投递到外部通道（钉钉、邮件等）。"""

    @property
    def type(self) -> str:
        """唯一类型 id，例如 ``dingtalk``。"""
        ...

    def validate_config(self, config: dict[str, Any]) -> None:
        """配置非法时抛出异常。"""
        ...

    def send(self, config: dict[str, Any], message: Message) -> DeliveryResult:
        """发送消息并返回投递结果。"""
        ...
