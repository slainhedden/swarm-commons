import os
from html.parser import HTMLParser
from typing import Annotated, Literal

import httpx
from starlette.responses import JSONResponse
from pydantic import BaseModel, StringConstraints


Kind = Literal["goals", "tasks", "threads", "comments", "notes"]
KINDS = {"goals", "tasks", "threads", "comments", "notes"}
Action = Literal["approve", "reject", "hide", "delete", "lock", "unlock", "release", "reject_submission"]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
RESERVED = {"admin", "administrator", "moderator", "mod", "swarm", "support", "system"}


class ReportInput(BaseModel):
    reason: Reason


class ModerationInput(ReportInput):
    action: Action


class RoleInput(BaseModel):
    role: Literal["contributor", "moderator"]


def admin_handles():
    return {item.strip() for item in os.environ.get("SWARM_ADMINS", "").split(",") if item.strip()}


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.parts = []
        self.ignored = None

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"} and self.ignored is None:
            self.ignored = tag

    def handle_endtag(self, tag):
        if tag == self.ignored:
            self.ignored = None

    def handle_data(self, data):
        if self.ignored is None:
            self.parts.append(data)

    def handle_entityref(self, name):
        self.handle_data(f"&{name};")

    def handle_charref(self, name):
        self.handle_data(f"&#{name};")


def plain_text(value):
    if not isinstance(value, str) or "<" not in value:
        return value
    parser = PlainText()
    parser.feed(value)
    parser.close()
    return "".join(parser.parts)


def check_github_pr(pr_url, claimed_at):
    from datetime import datetime

    _, _, _, owner, repo, _, number = pr_url.split("/")
    try:
        with httpx.Client(timeout=4, trust_env=False) as client:
            response = client.get(f"https://api.github.com/repos/{owner}/{repo}/pulls/{number}")
        if response.status_code == 404:
            return "invalid"
        if not response.is_success:
            return "unverified"
        data = response.json()
        opened = datetime.fromisoformat(data["created_at"].replace("Z", "+00:00")).timestamp()
        return "metadata_checked" if data["state"] == "open" and claimed_at is not None and opened >= claimed_at else "invalid"
    except (httpx.HTTPError, KeyError, ValueError):
        return "unverified"


class LimitWriteBody:
    def __init__(self, app, maximum=65536):
        self.app = app
        self.maximum = maximum

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "DELETE", "PATCH", "PUT"}:
            return await self.app(scope, receive, send)
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > self.maximum:
                response = JSONResponse({"detail": "Request body is too large."}, status_code=413)
                return await response(scope, receive, send)
            body.extend(chunk)
            if not message.get("more_body", False):
                break

        async def replay():
            nonlocal body
            if body is None:
                return await receive()
            payload, body = bytes(body), None
            return {"type": "http.request", "body": payload, "more_body": False}

        return await self.app(scope, replay, send)
