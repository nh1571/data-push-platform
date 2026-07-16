"""DingTalk work-notice (corp conversation) channel plugin.

Type: ``dingtalk.work_notice``

Uses app-key credentials to obtain an access token, then sends an
async work-notice (markdown or image) via ``topapi/message/corpconversation/asyncsend_v2``.
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
    """ChannelPlugin for DingTalk enterprise work notices.

    Config:

    - ``app_key`` (required)
    - ``app_secret`` (required)
    - ``agent_id`` (required, int or str)
    - ``userid_list`` (optional, comma-separated user ids)
    - ``dept_id_list`` (optional, comma-separated dept ids)
    - ``title`` (optional): markdown title (default ``数据推送``)

    At least one of ``userid_list`` / ``dept_id_list`` is required.
    """

    @property
    def type(self) -> str:
        return "dingtalk.work_notice"

    def validate_config(self, config: dict[str, Any]) -> None:
        missing = [k for k in ("app_key", "app_secret", "agent_id") if not config.get(k)]
        if missing:
            raise ValueError(f"missing required config: {', '.join(missing)}")
        userid_list = config.get("userid_list")
        dept_id_list = config.get("dept_id_list")
        if not userid_list and not dept_id_list:
            raise ValueError("userid_list or dept_id_list is required")

    @staticmethod
    def _part_path(part: MessagePart) -> str | None:
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
            # Prefer native image msgtype when path exists; text fallback omitted
            return ""
        return f"[{part.kind}]"

    @classmethod
    def _message_to_text(cls, message: Message) -> str:
        parts = [cls._part_to_text(p) for p in message.parts]
        text = "\n\n".join(p for p in parts if p)
        return text if text else ""

    @classmethod
    def _image_paths(cls, message: Message) -> list[str]:
        paths: list[str] = []
        for part in message.parts:
            if part.kind != "image":
                continue
            path = cls._part_path(part)
            if path:
                paths.append(path)
        return paths

    def _fetch_access_token(self, client: httpx.Client, config: dict[str, Any]) -> str:
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
        """Obtain access token then async-send markdown and/or image work notices."""
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
                    # No text and no images — send a placeholder markdown
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
