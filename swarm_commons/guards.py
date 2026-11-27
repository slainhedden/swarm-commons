import json
import shlex
import subprocess
import sys
from pathlib import Path

from .client import Client, SwarmError, SwarmUnavailable


def command_prefix():
    return f"{shlex.quote(sys.executable)} -m swarm_commons.cli"


def install_commit_guard(git_dir, task_id):
    guards = git_dir / "hooks"
    guards.mkdir(exist_ok=True)
    hook = guards / "pre-commit"
    hook.write_text(f"#!/bin/sh\nexec {command_prefix()} _commit-guard {task_id}\n")
    hook.chmod(0o700)


def verify_paths(task_id, paths):
    if not paths:
        return
    try:
        with Client.from_config() as client:
            for offset in range(0, len(paths), 500):
                result = client.post(f"tasks/{task_id}/paths/check", paths=paths[offset:offset + 500])
                if result["conflicts"]:
                    first = result["conflicts"][0]
                    raise SwarmError(f"{first['path']!r} is reserved by task #{first['task_id']}.")
    except SwarmUnavailable:
        print("swarm: path reservation server unreachable; allowing operation.", file=sys.stderr)


def staged_paths(workspace=None, base=None):
    result = subprocess.run(
        ("git", "diff", "--cached", "--name-only", "--no-renames", "-z", *([base] if base else [])),
        cwd=workspace, capture_output=True, check=True,
    )
    try:
        return [path.decode("utf-8") for path in result.stdout.split(b"\0") if path]
    except UnicodeDecodeError:
        raise SwarmError("This contribution contains non-UTF-8 paths.") from None


def commit_guard(task_id):
    verify_paths(task_id, staged_paths())


def claude_guard(task_id):
    event = json.load(sys.stdin)
    raw = event.get("tool_input", {}).get("file_path")
    try:
        if not raw:
            raise SwarmError("File edits must identify a workspace path.")
        workspace = Path.cwd().resolve()
        try:
            relative = Path(raw).resolve().relative_to(workspace).as_posix()
        except ValueError:
            raise SwarmError("Edits must stay inside the selected task's worktree.") from None
        verify_paths(task_id, [relative])
    except SwarmError as exc:
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": str(exc),
        }}))
