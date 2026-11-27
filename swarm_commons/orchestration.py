import re
from typing import Annotated, Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field, StringConstraints


PathString = Annotated[str, StringConstraints(min_length=1, max_length=1024)]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]


class TestResult(BaseModel):
    command: Text
    outcome: Literal["passed", "failed", "not_run"]


class Handoff(BaseModel):
    diff_url: Annotated[str, StringConstraints(max_length=350)] | None = None
    tests: list[TestResult] = Field(default_factory=list, max_length=20)
    files: list[PathString] = Field(default_factory=list, max_length=500)
    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    turns: int | None = Field(default=None, ge=0)
    open_questions: list[Text] = Field(default_factory=list, max_length=20)


class ReviewInput(BaseModel):
    submission_id: int = Field(gt=0)
    approved: bool
    summary: Text


class PathLeaseInput(BaseModel):
    path: PathString
    mode: Literal["exclusive", "shared"] = "exclusive"
    ttl_seconds: int = Field(default=600, ge=30, le=3600)


class PathCheckInput(BaseModel):
    paths: list[PathString] = Field(min_length=1, max_length=500)


READY_FILTER = """
    NOT EXISTS (
        SELECT 1 FROM task_dependencies d JOIN tasks upstream ON upstream.id = d.dependency_id
        WHERE d.task_id = t.id AND upstream.status <> 'done'
    )
"""


def register_dependencies(db, goal_id, task_id, ids):
    for dependency in set(ids):
        match = db.execute("SELECT 1 FROM tasks WHERE id = ? AND goal_id = ?", (dependency, goal_id)).fetchone()
        if dependency == task_id or not match:
            raise HTTPException(422, "Dependencies must be existing tasks under the same goal.")
        db.execute("INSERT INTO task_dependencies VALUES (?, ?)", (task_id, dependency))


def path_rule(value, *, allow_glob):
    subtree = allow_glob and value.endswith("/**")
    root = value[:-3] if subtree else value
    invalid_segments = {"", ".", "..", ".git"}
    if (
        not root or any(part.lower() in invalid_segments for part in root.split("/"))
        or re.search(r"[\x00-\x1f\x7f\\]", root) or (allow_glob and re.search(r"[*?\[\]]", root))
    ):
        raise HTTPException(422, "Use a repository-relative path or a directory followed by /**.")
    return root, subtree


def overlaps(left, right):
    left_path, left_tree = left
    right_path, right_tree = right
    return (
        left_path == right_path
        or (left_tree and right_path.startswith(left_path + "/"))
        or (right_tree and left_path.startswith(right_path + "/"))
    )


def repo_leases(db, repo, now):
    return db.execute("""
        SELECT p.* FROM path_leases p JOIN tasks t ON t.id = p.task_id
        WHERE p.repo = ? AND p.expires_at > ? AND t.status = 'claimed' AND t.lease_until > ?
            AND t.claimant = p.holder
    """, (repo, now, now))


def lease_path(db, *, task, handle, data, now):
    requested = path_rule(data.path, allow_glob=True)
    repo = task["repo_url"].lower()
    if db.connection.dialect.name == "postgresql":
        db.execute("LOCK TABLE path_leases IN SHARE ROW EXCLUSIVE MODE")
    for lease in repo_leases(db, repo, now):
        if lease["task_id"] == task["id"] and lease["holder"] == handle:
            continue
        if (lease["mode"] == "exclusive" or data.mode == "exclusive") and overlaps(
            requested, path_rule(lease["path"], allow_glob=True),
        ):
            raise HTTPException(409, f"Path overlaps a {lease['mode']} reservation for task #{lease['task_id']}.")
    return dict(db.execute("""
        INSERT INTO path_leases (repo, path, task_id, holder, mode, expires_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (repo, path, task_id) DO UPDATE SET holder = excluded.holder,
            mode = excluded.mode, expires_at = excluded.expires_at RETURNING *
    """, (repo, data.path, task["id"], handle, data.mode, min(now + data.ttl_seconds, task["lease_until"]))).fetchone())


def check_paths(db, *, task, handle, paths, now):
    targets = {value: path_rule(value, allow_glob=False) for value in paths}
    conflicts = []
    for lease in repo_leases(db, task["repo_url"].lower(), now):
        if lease["mode"] != "exclusive" or (lease["task_id"] == task["id"] and lease["holder"] == handle):
            continue
        reserved = path_rule(lease["path"], allow_glob=True)
        for value, target in targets.items():
            if overlaps(target, reserved):
                conflicts.append({"path": value, "reserved_path": lease["path"], "task_id": lease["task_id"]})
    return conflicts
