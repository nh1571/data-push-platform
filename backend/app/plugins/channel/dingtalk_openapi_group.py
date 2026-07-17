"""钉钉 OpenAPI 群机器人通道插件。

类型：``dingtalk.openapi_group_robot``

通过机器人 OpenAPI（``/v1.0/robot/groupMessages/send``）向企业群发消息，
支持 markdown 文本与图片（经 oapi media/upload 上传后 sampleImageMsg）。

配置：

- ``app_key``（必填）
- ``app_secret``（必填）
- ``robot_code``（必填）
- ``open_conversation_id``（必填）— 群会话 id
- ``title``（可选）：markdown 标题（默认 ``数据推送``）
- ``webhook_url``（可选）：OpenAPI 失败时文本消息的 Webhook 回退
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx

from app.plugins.base import DeliveryResult, Message, MessagePart

_DEFAULT_TIMEOUT = 30.0
_OAUTH_URL = "https://api.dingtalk.com/v1.0/oauth2/accessToken"
_GROUP_MSG_URL = "https://api.dingtalk.com/v1.0/robot/groupMessages/send"
_MEDIA_UPLOAD_URL = "https://oapi.dingtalk.com/media/upload"
_OAPI_TOKEN_URL = "https://oapi.dingtalk.com/gettoken"


class DingTalkOpenAPIGroupRobotPlugin:
    """钉钉应用机器人 → 群（OpenAPI）通道插件。"""

    @property
    def type(self) -> str:
        """插件类型标识。"""
        return "dingtalk.openapi_group_robot"

    def validate_config(self, config: dict[str, Any]) -> None:
        """校验 app 凭证、robot_code 与群会话 id。"""
        missing = [
            k
            for k in ("app_key", "app_secret", "robot_code", "open_conversation_id")
            if not config.get(k)
        ]
        if missing:
            raise ValueError(f"missing required config: {', '.join(missing)}")

    @staticmethod
    def _part_path(part: MessagePart) -> str | None:
        """从 part 提取 path/url。"""
        content = part.content
        if isinstance(content, dict):
            for key in ("path", "url", "download_url"):
                if content.get(key):
                    return str(content[key])
            return None
        if content is None:
            return None
        return str(content)

    @classmethod
    def _part_to_text(cls, part: MessagePart) -> str:
        """片段转 markdown 文本；image 单独发送，此处返回空。"""
        if part.kind == "text":
            return str(part.content) if part.content is not None else ""
        if part.kind == "card":
            content = part.content
            if isinstance(content, dict):
                title = content.get("title") or "卡片"
                text = content.get("text") or ""
                lines = [f"### {title}", ""]
                if text:
                    lines.append(str(text))
                return "\n".join(lines).rstrip()
            return str(content) if content is not None else ""
        if part.kind == "file":
            path = cls._part_path(part)
            name = ""
            if isinstance(part.content, dict) and part.content.get("filename"):
                name = str(part.content["filename"])
            label = f"文件: {name}".rstrip() if name else "文件"
            return f"{label}\n下载路径: {path}" if path else f"{label}: (no path)"
        if part.kind == "image":
            # 图片通过 sampleImageMsg 单独发送
            return ""
        return f"[{part.kind}]"

    @classmethod
    def _message_to_text(cls, message: Message) -> str:
        """拼接非图片片段正文。"""
        parts = [cls._part_to_text(p) for p in message.parts]
        text = "\n\n".join(p for p in parts if p)
        return text if text else "(empty message)"

    @classmethod
    def _image_parts(cls, message: Message) -> list[MessagePart]:
        """筛选 image 类型片段。"""
        return [p for p in message.parts if p.kind == "image"]

    def _fetch_new_access_token(self, client: httpx.Client, config: dict[str, Any]) -> str:
        """新版钉钉 API 应用 accessToken（群消息接口用）。"""
        resp = client.post(
            _OAUTH_URL,
            json={
                "appKey": str(config["app_key"]),
                "appSecret": str(config["app_secret"]),
            },
        )
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, dict):
            raise RuntimeError(f"unexpected accessToken response: {data!r}")
        token = data.get("accessToken") or data.get("access_token")
        if not token:
            raise RuntimeError(f"accessToken response missing token: {data!r}")
        return str(token)

    def _fetch_oapi_access_token(self, client: httpx.Client, config: dict[str, Any]) -> str:
        """旧版 oapi token（media/upload 用）。"""
        resp = client.get(
            _OAPI_TOKEN_URL,
            params={
                "appkey": str(config["app_key"]),
                "appsecret": str(config["app_secret"]),
            },
        )
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, dict):
            raise RuntimeError(f"unexpected gettoken response: {data!r}")
        errcode = data.get("errcode", 0)
        if errcode not in (0, "0", None):
            errmsg = data.get("errmsg") or str(data)
            raise RuntimeError(f"gettoken errcode={errcode}: {errmsg}")
        token = data.get("access_token")
        if not token:
            raise RuntimeError("gettoken response missing access_token")
        return str(token)

    def _upload_image(
        self,
        client: httpx.Client,
        oapi_token: str,
        path: str,
    ) -> str:
        """上传图片媒体，返回 media_id。"""
        file_path = Path(path)
        if not file_path.is_file():
            raise RuntimeError(f"image file not found: {path}")
        with file_path.open("rb") as fh:
            resp = client.post(
                _MEDIA_UPLOAD_URL,
                params={"access_token": oapi_token, "type": "image"},
                files={"media": (file_path.name, fh, "image/png")},
            )
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, dict):
            raise RuntimeError(f"unexpected media/upload response: {data!r}")
        errcode = data.get("errcode", 0)
        if errcode not in (0, "0", None):
            errmsg = data.get("errmsg") or str(data)
            raise RuntimeError(f"media/upload errcode={errcode}: {errmsg}")
        media_id = data.get("media_id")
        if not media_id:
            raise RuntimeError("media/upload response missing media_id")
        return str(media_id)

    def _send_group_msg(
        self,
        client: httpx.Client,
        access_token: str,
        config: dict[str, Any],
        msg_key: str,
        msg_param: dict[str, Any],
    ) -> dict[str, Any]:
        """调用 groupMessages/send（msg_key 如 sampleMarkdown / sampleImageMsg）。"""
        payload = {
            "robotCode": str(config["robot_code"]),
            "openConversationId": str(config["open_conversation_id"]),
            "msgKey": msg_key,
            "msgParam": json.dumps(msg_param, ensure_ascii=False),
        }
        resp = client.post(
            _GROUP_MSG_URL,
            headers={"x-acs-dingtalk-access-token": access_token},
            json=payload,
        )
        try:
            data = resp.json()
        except ValueError:
            data = {"raw": resp.text[:500]}
        if resp.status_code >= 400:
            raise RuntimeError(f"groupMessages HTTP {resp.status_code}: {data}")
        if isinstance(data, dict) and data.get("code") and str(data.get("code")) not in ("0", ""):
            # 新 API 业务错误可能带 code/message
            if data.get("message") or data.get("msg"):
                raise RuntimeError(
                    f"groupMessages error: {data.get('code')} {data.get('message') or data.get('msg')}"
                )
        return data if isinstance(data, dict) else {"result": data}

    def _send_webhook_fallback(
        self,
        client: httpx.Client,
        config: dict[str, Any],
        text: str,
    ) -> DeliveryResult | None:
        """OpenAPI 文本发送失败时的可选 Webhook 回退；未配置则返回 None。"""
        webhook = config.get("webhook_url")
        if not webhook:
            return None
        title = str(config.get("title") or "数据推送")
        payload = {
            "msgtype": "markdown",
            "markdown": {"title": title, "text": text},
        }
        resp = client.post(str(webhook), json=payload)
        try:
            data = resp.json()
        except ValueError:
            data = None
        if resp.status_code >= 400:
            return DeliveryResult(
                success=False,
                error=f"webhook HTTP {resp.status_code}: {data or resp.text[:300]}",
            )
        if isinstance(data, dict):
            errcode = data.get("errcode", 0)
            if errcode not in (0, "0", None):
                return DeliveryResult(
                    success=False,
                    error=f"webhook errcode={errcode}: {data.get('errmsg') or data}",
                )
        return DeliveryResult(success=True, provider_msg_id=None)

    def send(self, config: dict[str, Any], message: Message) -> DeliveryResult:
        """按 Message.parts 顺序发送（图前文案 → 图 → 图后文案）。

        不可再「全文合并后先于全部图片发送」，否则图后文案会跑到图前。
        """
        try:
            self.validate_config(config)
        except ValueError as exc:
            return DeliveryResult(success=False, error=str(exc))

        title = str(config.get("title") or "数据推送")
        provider_ids: list[str] = []
        sent_any = False

        if not message.parts:
            return DeliveryResult(success=False, error="empty message")

        try:
            with httpx.Client(timeout=_DEFAULT_TIMEOUT) as client:
                access_token = self._fetch_new_access_token(client, config)
                oapi_token: str | None = None

                for part in message.parts:
                    if part.kind == "image":
                        path = self._part_path(part)
                        if not path:
                            continue
                        if oapi_token is None:
                            oapi_token = self._fetch_oapi_access_token(client, config)
                        media_id = self._upload_image(client, oapi_token, path)
                        data = self._send_group_msg(
                            client,
                            access_token,
                            config,
                            msg_key="sampleImageMsg",
                            msg_param={"photoURL": media_id},
                        )
                        pid = data.get("processQueryKey") or data.get("processQueryKeys")
                        if pid is not None:
                            provider_ids.append(str(pid))
                        sent_any = True
                        continue

                    text = self._part_to_text(part).strip()
                    if not text:
                        continue
                    try:
                        data = self._send_group_msg(
                            client,
                            access_token,
                            config,
                            msg_key="sampleMarkdown",
                            msg_param={"title": title, "text": text},
                        )
                        pid = data.get("processQueryKey") or data.get("processQueryKeys")
                        if pid is not None:
                            provider_ids.append(str(pid))
                        sent_any = True
                    except RuntimeError as exc:
                        fallback = self._send_webhook_fallback(client, config, text)
                        if fallback is not None:
                            if not fallback.success:
                                return fallback
                            sent_any = True
                        else:
                            return DeliveryResult(success=False, error=str(exc))

                if not sent_any:
                    return DeliveryResult(success=False, error="empty message")

        except httpx.HTTPError as exc:
            return DeliveryResult(success=False, error=f"http error: {exc}")
        except RuntimeError as exc:
            return DeliveryResult(success=False, error=str(exc))
        except OSError as exc:
            return DeliveryResult(success=False, error=f"file error: {exc}")

        return DeliveryResult(
            success=True,
            provider_msg_id=",".join(provider_ids) if provider_ids else None,
        )
