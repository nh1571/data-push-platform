"""Domain enumerations stored as strings in the database."""

from enum import StrEnum


class DataSourceType(StrEnum):
    """Supported data source connector types."""

    MYSQL = "mysql"
    POSTGRES = "postgres"
    HTTP = "http"


class ChannelType(StrEnum):
    """Supported delivery channel types."""

    WEBHOOK = "webhook"
    EMAIL = "email"
    FEISHU = "feishu"
    DINGTALK = "dingtalk"
    WECOM = "wecom"


class JobRunStatus(StrEnum):
    """Lifecycle status of a push job run.

    Terminal states: ``succeeded`` | ``failed`` | ``partial``
    (plus optional ``cancelled`` / ``skipped`` for future use).
    """

    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    PARTIAL = "partial"
    CANCELLED = "cancelled"
    SKIPPED = "skipped"


class TriggerType(StrEnum):
    """How a job run was triggered."""

    MANUAL = "manual"
    SCHEDULE = "schedule"
    API = "api"
    RETRY = "retry"


class DeliveryStatus(StrEnum):
    """Lifecycle status of a single channel delivery."""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


class LogLevel(StrEnum):
    """Severity level for job run log lines."""

    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
