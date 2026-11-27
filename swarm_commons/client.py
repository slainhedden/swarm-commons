import json
import os
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

import httpx


class SwarmError(Exception):
    pass


def server_url(value):
    try:
        parsed = urlsplit(value)
        valid = (
            parsed.hostname and not parsed.username and not parsed.password
            and not parsed.query and not parsed.fragment
            and (parsed.scheme == "https" or
                 (parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1"}))
        )
    except ValueError:
        valid = False
    if not valid:
        raise SwarmError("Use an HTTPS server URL (HTTP is allowed only on loopback).")
    return value.rstrip("/")


def config_path():
    return Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "swarm-commons" / "contributor.json"


def save_config(settings):
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as temp:
        json.dump(settings, temp)
    Path(temp.name).replace(path)


def load_config():
    try:
        return json.loads(config_path().read_text())
    except (OSError, ValueError):
        raise SwarmError("Run swarm login first.") from None


class Client:
    def __init__(self, server, token=None, *, transport=None):
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        self.http = httpx.Client(
            base_url=server_url(server), headers=headers, timeout=15, trust_env=False, transport=transport,
        )

    @classmethod
    def from_config(cls):
        settings = load_config()
        return cls(settings["server"], settings["token"])

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.http.close()

    def request(self, method, path, **kwargs):
        try:
            response = self.http.request(method, f"api/v1/{path}", **kwargs)
        except httpx.HTTPError:
            raise SwarmError("Could not reach Swarm Commons.") from None
        if not response.is_success:
            try:
                detail = response.json().get("detail")
            except (ValueError, AttributeError):
                detail = None
            raise SwarmError(detail if isinstance(detail, str) else f"Swarm server returned HTTP {response.status_code}.")
        try:
            return response.json()
        except ValueError:
            raise SwarmError("Swarm server did not return JSON.") from None

    def get(self, path, **params):
        return self.request("GET", path, params=params)

    def post(self, path, **data):
        return self.request("POST", path, json=data)
