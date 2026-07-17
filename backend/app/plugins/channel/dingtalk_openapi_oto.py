"""钉钉 OpenAPI 单聊（OTO）机器人通道插件。

类型：``dingtalk.openapi_oto_robot``

对齐遗留 pythonProject4 的 ``singleshot`` / BatchSendOTO：
通过应用机器人向一组 userId 发送 markdown 与/或图片。

配置：

- ``app_key``（必填）
- ``app_secret``（必填）
- ``robot_code``（必填）
- ``user_ids``（必填）：list[str] 或逗号分隔字符串
- ``title``（可选）：markdown 标题（默认 ``数据推送``）
- ``batch_size``（可选）：每批用户数（默认 20，与遗留分片一致）
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx

from app.plugins.base import DeliveryResult, Message, MessagePart

_DEFAULT_TIMEOUT = 30.0
_DEFAULT_BATCH = 20
_OAUTH_URL = "https://api.dingtalk.com/v1.0/oauth2/accessToken"
_OTO_MSG_URL = "https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend"
_MEDIA_UPLOAD_URL = "https://oapi.dingtalk.com/media/upload"
_OAPI_TOKEN_URL = "https://oapi.dingtalk.com/gettoken"


def _parse_user_ids(config: dict[str, Any]) -> list[str]:
    """解析 user_ids / userid_list 为去空白后的字符串列表。"""
    raw = config.get("user_ids") or config.get("userid_list")
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    text = str(raw).replace("，", ",").replace(";", ",")
    return [p.strip() for p in text.split(",") if p.strip()]


def _chunked(items: list[str], size: int) -> list[list[str]]:
    """将列表按 size 分片（size < 1 时回退默认批大小）。"""
    if size < 1:
        size = _DEFAULT_BATCH
    return [items[i : i + size] for i in range(0, len(items), size)]


class DingTalkOpenAPIOtoRobotPlugin:
    """钉钉应用机器人 → 用户（OTO 批量）通道插件。"""

    @property
    def type(self) -> str:
        """插件类型标识。"""
        return "dingtalk.openapi_oto_robot"

    def validate_config(self, config: dict[str, Any]) -> None:
        """校验凭证、robot_code 与 user_ids。"""
        missing = [k for k in ("app_key", "app_secret", "robot_code") if not config.get(k)]
        if missing:
            raise ValueError(f"missing required config: {', '.join(missing)}")
        if not _parse_user_ids(config):
            raise ValueError("user_ids is required (list or comma-separated)")

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
        """片段转文本；image 单独 sampleImageMsg 发送。"""
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
            return f"文件: {path}" if path else "文件: (no path)"
        if part.kind == "image":
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
        """筛选 image 片段。"""
        return [p for p in message.parts if p.kind == "image"]

    def _fetch_new_access_token(self, client: httpx.Client, config: dict[str, Any]) -> str:
        """新版 API accessToken（OTO batchSend 用）。"""
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

    def _upload_image(self, client: httpx.Client, oapi_token: str, path: str) -> str:
        """上传本地图片，返回 media_id。"""
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

    def _send_oto(
        self,
        client: httpx.Client,
        access_token: str,
        config: dict[str, Any],
        user_ids: list[str],
        msg_key: str,
        msg_param: dict[str, Any],
    ) -> dict[str, Any]:
        """调用 oToMessages/batchSend 向一批用户发消息。"""
        payload = {
            "robotCode": str(config["robot_code"]),
            "userIds": user_ids,
            "msgKey": msg_key,
            "msgParam": json.dumps(msg_param, ensure_ascii=False),
        }
        resp = client.post(
            _OTO_MSG_URL,
            headers={"x-acs-dingtalk-access-token": access_token},
            json=payload,
        )
        try:
            data = resp.json()
        except ValueError:
            data = {"raw": resp.text[:500]}
        if resp.status_code >= 400:
            raise RuntimeError(f"oToMessages HTTP {resp.status_code}: {data}")
        if isinstance(data, dict) and data.get("code") and str(data.get("code")) not in ("0", ""):
            if data.get("message") or data.get("msg"):
                raise RuntimeError(
                    f"oToMessages error: {data.get('code')} {data.get('message') or data.get('msg')}"
                )
        return data if isinstance(data, dict) else {"result": data}

    def send(self, config: dict[str, Any], message: Message) -> DeliveryResult:
        """按批向 user_ids 发送 markdown 与图片 OTO 消息。"""
        try:
            self.validate_config(config)
        except ValueError as exc:
            return DeliveryResult(success=False, error=str(exc))

        user_ids = _parse_user_ids(config)
        batch_size = int(config.get("batch_size") or _DEFAULT_BATCH)
        title = str(config.get("title") or "数据推送")
        provider_ids: list[str] = []

        if not message.parts:
            return DeliveryResult(success=False, error="empty message")

        try:
            with httpx.Client(timeout=_DEFAULT_TIMEOUT) as client:
                access_token = self._fetch_new_access_token(client, config)
                oapi_token: str | None = None

                for batch in _chunked(user_ids, batch_size):
                    # 严格按 parts 顺序：图前 MD → 图 → 图后 MD
                    for part in message.parts:
                        if part.kind == "image":
                            path = self._part_path(part)
                            if not path:
                                continue
                            if oapi_token is None:
                                oapi_token = self._fetch_oapi_access_token(client, config)
                            media_id = self._upload_image(client, oapi_token, path)
                            data = self._send_oto(
                                client,
                                access_token,
                                config,
                                batch,
                                msg_key="sampleImageMsg",
                                msg_param={"photoURL": media_id},
                            )
                            pid = data.get("processQueryKey") or data.get("processQueryKeys")
                            if pid is not None:
                                provider_ids.append(str(pid))
                            continue
                        text = self._part_to_text(part).strip()
                        if not text:
                            continue
                        data = self._send_oto(
                            client,
                            access_token,
                            config,
                            batch,
                            msg_key="sampleMarkdown",
                            msg_param={"title": title, "text": text},
                        )
                        pid = data.get("processQueryKey") or data.get("processQueryKeys")
                        if pid is not None:
                            provider_ids.append(str(pid))

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
