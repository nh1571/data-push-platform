"""领域枚举：在数据库中以字符串形式存储。

注意：部分模型列使用自由字符串以兼容历史数据/扩展插件类型名，
本模块枚举主要用于校验、API 契约与文档，并非全部列都强制外键到枚举。
"""

from enum import StrEnum


class DataSourceType(StrEnum):
    """数据源连接器类型（核心枚举；插件还可注册 sqlite/doris/sqlserver 等）。"""

    MYSQL = "mysql"
    POSTGRES = "postgres"
    HTTP = "http"


class ChannelType(StrEnum):
    """投递通道类型（核心枚举；钉钉插件细分为 webhook/work_notice/openapi 等）。"""

    WEBHOOK = "webhook"
    EMAIL = "email"
    FEISHU = "feishu"
    DINGTALK = "dingtalk"
    WECOM = "wecom"


class JobRunStatus(StrEnum):
    """推送任务单次运行（JobRun）生命周期状态。

    终态：``succeeded`` | ``failed`` | ``partial``
    （``cancelled`` / ``skipped`` 预留给未来能力）。
    """

    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    PARTIAL = "partial"
    CANCELLED = "cancelled"
    SKIPPED = "skipped"


class TriggerType(StrEnum):
    """JobRun 的触发来源。"""

    MANUAL = "manual"
    SCHEDULE = "schedule"
    API = "api"
    RETRY = "retry"
    RERUN = "rerun"


class DeliveryStatus(StrEnum):
    """单通道投递（Delivery）生命周期状态。"""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


class LogLevel(StrEnum):
    """JobRun 结构化日志行的严重级别。"""

    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
