"""ORM 模型包：导入全部模型以使 metadata 完成注册。

``create_all`` / Alembic 依赖此包的副作用导入，确保各表定义已挂到 Base.metadata。
"""

from app.db.models.api_token import ApiToken
from app.db.models.channel import Channel
from app.db.models.identity import ChannelRecipient, Identity, RecipientGroup, RecipientGroupMember
from app.db.models.data_source import DataSource
from app.db.models.delivery import Delivery
from app.db.models.enums import (
    ChannelType,
    DataSourceType,
    DeliveryStatus,
    JobRunStatus,
    LogLevel,
    TriggerType,
)
from app.db.models.job_run import JobRun
from app.db.models.job_run_log import JobRunLog
from app.db.models.operator import Operator
from app.db.models.push_job import PushJob
from app.db.models.studio_template import StudioTemplate

__all__ = [
    "ApiToken",
    "Channel",
    "ChannelRecipient",
    "ChannelType",
    "Identity",
    "DataSource",
    "DataSourceType",
    "Delivery",
    "DeliveryStatus",
    "JobRun",
    "JobRunLog",
    "JobRunStatus",
    "LogLevel",
    "Operator",
    "PushJob",
    "RecipientGroup",
    "RecipientGroupMember",
    "StudioTemplate",
    "TriggerType",
]
