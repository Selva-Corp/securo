"""ntfy push channel (fork feature).

Uses ntfy's JSON publish endpoint (POST to the server root) rather than the
header form: header values are ASCII-only, JSON carries any UTF-8 title.
"""

from __future__ import annotations

import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 10.0


class NtfyError(Exception):
    pass


async def send(
    server_url: str,
    topic: str,
    token: Optional[str],
    *,
    title: str,
    body: str,
    tags: Optional[list[str]] = None,
    click_url: Optional[str] = None,
    priority: int = 3,
    transport: Optional[httpx.AsyncBaseTransport] = None,
) -> None:
    """Publish one message. Raises NtfyError on any failure."""
    server = (server_url or "").strip().rstrip("/")
    topic = (topic or "").strip().strip("/")
    if not server or not topic:
        raise NtfyError("ntfy server URL and topic are required")
    if not server.startswith(("http://", "https://")):
        server = "https://" + server

    payload: dict = {
        "topic": topic,
        "title": title,
        "message": body,
        "priority": max(1, min(5, int(priority))),
    }
    if tags:
        payload["tags"] = tags
    if click_url:
        payload["click"] = click_url
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS, transport=transport) as client:
            response = await client.post(server, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise NtfyError(f"ntfy request failed: {exc}") from exc
    if response.status_code >= 400:
        detail = response.text[:200].strip()
        raise NtfyError(f"ntfy returned {response.status_code}: {detail}")
