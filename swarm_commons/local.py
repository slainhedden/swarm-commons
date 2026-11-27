import os
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, Field, ValidationError

from .client import SwarmError, config_path


def state_root():
    return Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local/state")) / "swarm-commons"


class Policy(BaseModel):
    task_minutes: int = Field(default=45, ge=1, le=45)
    daily_minutes: int = Field(default=120, ge=1, le=1440)
    max_turns: int = Field(default=20, ge=1, le=200)
    claude_max_budget_usd: float | None = Field(default=None, gt=0, le=100)
    allowed_start_hour: int = Field(default=0, ge=0, le=23)
    allowed_end_hour: int = Field(default=24, ge=1, le=24)

    def allows(self, hour):
        if self.allowed_start_hour < self.allowed_end_hour:
            return self.allowed_start_hour <= hour < self.allowed_end_hour
        return hour >= self.allowed_start_hour or hour < self.allowed_end_hour


def load_policy():
    try:
        return Policy.model_validate_json((config_path().parent / "policy.json").read_text())
    except FileNotFoundError:
        return Policy()
    except (OSError, ValidationError) as exc:
        raise SwarmError("Invalid local policy.json; see the README.") from exc


@contextmanager
def usage_reservation(policy, minutes, *, now=datetime.now):
    moment = now()
    if not policy.allows(moment.hour):
        raise SwarmError("Local policy does not allow agent runs at this hour.")
    if minutes > policy.task_minutes:
        raise SwarmError(f"Local policy caps a task at {policy.task_minutes} minutes.")
    directory = state_root()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    db = sqlite3.connect(directory / "usage.sqlite3")
    start = time.monotonic()
    try:
        day = moment.date().isoformat()
        db.execute("CREATE TABLE IF NOT EXISTS usage (id INTEGER PRIMARY KEY, day TEXT, seconds INTEGER)")
        db.execute("BEGIN IMMEDIATE")
        spent = db.execute("SELECT COALESCE(SUM(seconds), 0) FROM usage WHERE day = ?", (day,)).fetchone()[0]
        if spent + minutes * 60 > policy.daily_minutes * 60:
            raise SwarmError("Local daily run-time cap reached; lower this run's time limit or try tomorrow.")
        reservation = db.execute("INSERT INTO usage (day, seconds) VALUES (?, ?)", (day, minutes * 60)).lastrowid
        db.commit()
        try:
            yield
        finally:
            elapsed = min(minutes * 60, max(1, int(time.monotonic() - start) + 1))
            with db:
                db.execute("UPDATE usage SET seconds = ? WHERE id = ?", (elapsed, reservation))
    finally:
        db.close()


def safe_env():
    allowed = {
        "PATH", "HOME", "USER", "LOGNAME", "SHELL", "TERM", "TMPDIR", "TMP", "TEMP", "LANG",
        "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_RUNTIME_DIR", "XDG_CACHE_HOME",
        "CLAUDE_CONFIG_DIR", "CODEX_HOME", "DBUS_SESSION_BUS_ADDRESS",
    }
    return {key: value for key, value in os.environ.items() if key in allowed or key.startswith("LC_")}
