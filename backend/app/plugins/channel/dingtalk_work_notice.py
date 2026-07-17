"""钉钉工作通知（企业会话）通道插件。

类型：``dingtalk.work_notice``

使用 app_key/app_secret 获取 access_token，再通过
``topapi/message/corpconversation/asyncsend_v2`` 异步发送工作通知
（markdown 与/或 image）。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx

from app.plugins.base import DeliveryResult, Message, MessagePart

_DEFAULT_TIMEOUT = 30.0
_TOKEN_URL = "https://oapi.dingtalk.com/gettoken"
_SEND_URL = "https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2"
_MEDIA_UPLOAD_URL = "https://oapi.dingtalk.com/media/upload"


class DingTalkWorkNoticePlugin:
    """钉钉企业工作通知通道插件。

    配置：

    - ``app_key``（必填）
    - ``app_secret``（必填）
    - ``agent_id``（必填，int 或 str）
    - ``userid_list``（可选，逗号分隔用户 id）
    - ``dept_id_list``（可选，逗号分隔部门 id）
    - ``title``（可选）：markdown 标题（默认 ``数据推送``）

    ``userid_list`` 与 ``dept_id_list`` 至少填其一。
    """

    @property
    def type(self) -> str:
        """插件类型标识。"""
        return "dingtalk.work_notice"

    def validate_config(self, config: dict[str, Any]) -> None:
        """校验凭证与收件人列表。"""
        missing = [k for k in ("app_key", "app_secret", "agent_id") if not config.get(k)]
        if missing:
            raise ValueError(f"missing required config: {', '.join(missing)}")
        userid_list = config.get("userid_list")
        dept_id_list = config.get("dept_id_list")
        if not userid_list and not dept_id_list:
            raise ValueError("userid_list or dept_id_list is required")

    @staticmethod
    def _part_path(part: MessagePart) -> str | None:
        """从 part 提取本地/远程路径。"""
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
        """片段转文本；image 走原生图片消息，此处返回空。"""
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
            # 有路径时优先原生 image msgtype；不在文本中重复
            return ""
        return f"[{part.kind}]"

    @classmethod
    def _message_to_text(cls, message: Message) -> str:
        """拼接非图片片段为 markdown 正文。"""
        parts = [cls._part_to_text(p) for p in message.parts]
        text = "\n\n".join(p for p in parts if p)
        return text if text else ""

    @classmethod
    def _image_paths(cls, message: Message) -> list[str]:
        """收集 image 片段中的可上传路径。"""
        paths: list[str] = []
        for part in message.parts:
            if part.kind != "image":
                continue
            path = cls._part_path(part)
            if path:
                paths.append(path)
        return paths

    def _fetch_access_token(self, client: httpx.Client, config: dict[str, Any]) -> str:
        """调用 gettoken 获取 oapi access_token。"""
        resp = client.get(
            _TOKEN_URL,
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

    def _upload_image(self, client: httpx.Client, access_token: str, path: str) -> str:
        """上传本地图片到 media/upload，返回 media_id。"""
        file_path = Path(path)
        if not file_path.is_file():
            raise RuntimeError(f"image file not found: {path}")
        with file_path.open("rb") as fh:
            resp = client.post(
                _MEDIA_UPLOAD_URL,
                params={"access_token": access_token, "type": "image"},
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

    def _base_body(self, config: dict[str, Any], msg: dict[str, Any]) -> dict[str, Any]:
        """组装 asyncsend_v2 请求体（agent + 收件人 + msg）。"""
        body: dict[str, Any] = {
            "agent_id": config["agent_id"],
            "msg": msg,
        }
        if config.get("userid_list"):
            body["userid_list"] = str(config["userid_list"])
        if config.get("dept_id_list"):
            body["dept_id_list"] = str(config["dept_id_list"])
        return body

    def _post_send(
        self,
        client: httpx.Client,
        access_token: str,
        body: dict[str, Any],
    ) -> DeliveryResult:
        """POST 一次工作通知发送并解析 errcode / task_id。"""
        resp = client.post(
            _SEND_URL,
            params={"access_token": access_token},
            json=body,
        )
        try:
            data = resp.json()
        except ValueError:
            data = None

        if resp.status_code >= 400:
            detail = data if data is not None else resp.text[:500]
            return DeliveryResult(
                success=False,
                error=f"HTTP {resp.status_code}: {detail}",
            )

        if isinstance(data, dict):
            errcode = data.get("errcode", 0)
            if errcode not in (0, "0", None):
                errmsg = data.get("errmsg") or str(data)
                return DeliveryResult(success=False, error=f"dingtalk errcode={errcode}: {errmsg}")
            task_id = data.get("task_id") or data.get("request_id")
            return DeliveryResult(
                success=True,
                provider_msg_id=str(task_id) if task_id is not None else None,
            )

        return DeliveryResult(success=True, provider_msg_id=None)

    def send(self, config: dict[str, Any], message: Message) -> DeliveryResult:
        """获取 token 后异步发送 markdown 与/或 image 工作通知。"""
        try:
            self.validate_config(config)
        except ValueError as exc:
            return DeliveryResult(success=False, error=str(exc))

        try:
            with httpx.Client(timeout=_DEFAULT_TIMEOUT) as client:
                access_token = self._fetch_access_token(client, config)
                text = self._message_to_text(message)
                image_paths = self._image_paths(message)
                last: DeliveryResult | None = None
                provider_ids: list[str] = []

                if text:
                    title = str(config.get("title") or "数据推送")
                    body = self._base_body(
                        config,
                        {
                            "msgtype": "markdown",
                            "markdown": {"title": title, "text": text},
                        },
                    )
                    last = self._post_send(client, access_token, body)
                    if not last.success:
                        return last
                    if last.provider_msg_id:
                        provider_ids.append(last.provider_msg_id)

                for path in image_paths:
                    media_id = self._upload_image(client, access_token, path)
                    body = self._base_body(
                        config,
                        {
                            "msgtype": "image",
                            "image": {"media_id": media_id},
                        },
                    )
                    last = self._post_send(client, access_token, body)
                    if not last.success:
                        return last
                    if last.provider_msg_id:
                        provider_ids.append(last.provider_msg_id)

                if last is None:
                    # 无文本且无图 — 发送占位 markdown
                    title = str(config.get("title") or "数据推送")
                    body = self._base_body(
                        config,
                        {
                            "msgtype": "markdown",
                            "markdown": {"title": title, "text": "(empty message)"},
                        },
                    )
                    last = self._post_send(client, access_token, body)
                    if not last.success:
                        return last
                    if last.provider_msg_id:
                        provider_ids.append(last.provider_msg_id)

                return DeliveryResult(
                    success=True,
                    provider_msg_id=",".join(provider_ids) if provider_ids else last.provider_msg_id,
                )
        except httpx.HTTPError as exc:
            return DeliveryResult(success=False, error=f"http error: {exc}")
        except RuntimeError as exc:
            return DeliveryResult(success=False, error=str(exc))
        except OSError as exc:
            return DeliveryResult(success=False, error=f"file error: {exc}")
