"""Plugin protocol / data contracts for datasources, renderers, and channels."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


@dataclass
class QueryResult:
    """Tabular result from a data source query."""

    columns: list[str]
    rows: list[list[Any]]


@dataclass
class MessagePart:
    """One piece of a push message (text, image, file, etc.)."""

    kind: str
    content: Any  # dict | str | path-like


@dataclass
class Message:
    """Outbound message composed of one or more parts."""

    parts: list[MessagePart] = field(default_factory=list)


@dataclass
class DeliveryResult:
    """Outcome of sending a message via a channel plugin."""

    success: bool
    provider_msg_id: str | None = None
    error: str | None = None


@runtime_checkable
class DataSourcePlugin(Protocol):
    """Query backend (MySQL, HTTP API, etc.)."""

    @property
    def type(self) -> str:
        """Unique type id, e.g. ``mysql``."""
        ...

    def validate_config(self, config: dict[str, Any]) -> None:
        """Raise if config is invalid."""
        ...

    def execute(
        self,
        config: dict[str, Any],
        sql: str,
        params: dict[str, Any],
    ) -> QueryResult:
        """Run a parameterized query and return tabular rows."""
        ...


@runtime_checkable
class RendererPlugin(Protocol):
    """Turn a QueryResult into message parts (markdown table, image chart, …)."""

    @property
    def type(self) -> str:
        """Unique type id, e.g. ``markdown_table``."""
        ...

    def render(
        self,
        result: QueryResult,
        config: dict[str, Any],
        params: dict[str, Any],
    ) -> list[MessagePart]:
        ...


@runtime_checkable
class ChannelPlugin(Protocol):
    """Deliver a Message to an external channel (DingTalk, email, …)."""

    @property
    def type(self) -> str:
        """Unique type id, e.g. ``dingtalk``."""
        ...

    def validate_config(self, config: dict[str, Any]) -> None:
        """Raise if config is invalid."""
        ...

    def send(self, config: dict[str, Any], message: Message) -> DeliveryResult:
        ...
