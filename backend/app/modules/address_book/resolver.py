"""身份解析器：在调用 ChannelPlugin.send() 前，从 channel_recipients 表查出
收件人身份，按通道类型注入到 config dict 的对应字段中。

如果通道在 channel_recipients 中没有记录，则原样返回 config（向后兼容
旧配置里直接在 config_enc 写 user_ids 字符串的通道）。
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.identity import ChannelRecipient

# 通道类型 → (person 注入 key, group 注入 key)
# webhook 类通道不在此表中，resolver 会原样返回 config
_CHANNEL_RECIPIENT_KEYS: dict[str, tuple[str | None, str | None]] = {
    "dingtalk.openapi_oto_robot": ("user_ids", None),
    "dingtalk.work_notice": ("userid_list", None),
    "dingtalk.openapi_group_robot": (None, "open_conversation_id"),
}


def resolve_recipient_ids(
    db: Session,
    channel_id: UUID,
    channel_type: str,
    config: dict,
) -> dict:
    """从 channel_recipients 查出收件人身份 ID，注入到 config。

    返回的 config 是原 config 的浅拷贝 + 注入字段；原 config 不会被修改。
    """
    mapping = _CHANNEL_RECIPIENT_KEYS.get(channel_type)
    if mapping is None:
        # 不需要动态收件人的通道（如 webhook），原样返回
        return config

    person_key, group_key = mapping

    # 查出该通道的所有关联身份
    rows = db.scalars(
        select(ChannelRecipient).where(
            ChannelRecipient.channel_id == channel_id
        )
    ).all()

    if not rows:
        # 没有关联身份 —— 向后兼容：用 config 里已有的原始字符串
        return config

    persons: list[str] = []
    groups: list[str] = []

    for cr in rows:
        ident = cr.identity
        if ident.kind == "person":
            persons.append(ident.external_id)
        elif ident.kind == "group":
            groups.append(ident.external_id)

    enriched = dict(config)

    if person_key and persons:
        enriched[person_key] = ",".join(persons)
    if group_key and groups:
        # 群机器人目前只支持单个群；取第一个
        enriched[group_key] = groups[0]

    return enriched
