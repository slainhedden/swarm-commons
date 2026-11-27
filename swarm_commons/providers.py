import json
import os
import queue
import signal
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from .client import SwarmError
from .guards import command_prefix
from .local import safe_env


@dataclass
class Usage:
    input_tokens: int | None = None
    output_tokens: int | None = None
    turns: int | None = None

    def update(self, provider, event):
        if provider == "claude" and event.get("type") == "result":
            numbers = event.get("usage") or {}
            self.input_tokens = numbers.get("input_tokens")
            self.output_tokens = numbers.get("output_tokens")
            self.turns = event.get("num_turns")
        elif provider == "codex":
            tag = event.get("type")
            if tag == "turn.started":
                self.turns = (self.turns or 0) + 1
            if tag == "turn.completed":
                numbers = event.get("usage") or {}
                self.input_tokens = (self.input_tokens or 0) + numbers.get("input_tokens", 0)
                self.output_tokens = (self.output_tokens or 0) + numbers.get("output_tokens", 0)


def provider_command(provider, prompt, workspace, task_id, policy, directory, swarm, launcher=None):
    mcp_args = ["mcp", "--task-id", str(task_id)]
    if provider == "claude":
        mcp_config = directory / "mcp.json"
        mcp_config.write_text(json.dumps({"mcpServers": {"swarm": {"command": swarm, "args": mcp_args}}}))
        settings = directory / "settings.json"
        settings.write_text(json.dumps({"hooks": {"PreToolUse": [{
            "matcher": "Edit|Write|MultiEdit",
            "hooks": [{"type": "command", "command": f"{command_prefix()} _claude-guard {task_id}", "timeout": 25}],
        }]}}))
        command = [
            "claude", "-p", "--restricted", "--strict-mcp-config", "--mcp-config", str(mcp_config),
            "--settings", str(settings), "--permission-mode", "acceptEdits", "--tools", "Read,Edit,Write,Glob,Grep",
            "--allowedTools", "mcp__swarm__list_goals,mcp__swarm__list_tasks,mcp__swarm__get_task,"
            "mcp__swarm__post_note,mcp__swarm__read_notes,mcp__swarm__propose_subtasks,mcp__swarm__reserve_path",
            "--output-format", "stream-json", "--verbose", "--max-turns", str(policy.max_turns),
        ]
        if policy.claude_max_budget_usd is not None:
            command += ["--max-budget-usd", str(policy.claude_max_budget_usd)]
        return [*command, "--", prompt]
    command = [
        "codex", "-c", f"mcp_servers.swarm.command={json.dumps(swarm)}",
        "-c", f"mcp_servers.swarm.args={json.dumps(mcp_args)}", "--ask-for-approval", "never",
        "-c", f"projects.{json.dumps(str(workspace))}.trust_level={json.dumps('untrusted')}",
        "-c", "sandbox_workspace_write.network_access=false", "exec", "--json",
    ]
    flags = ["--sandbox", "workspace-write"] if launcher is None else ["--dangerously-bypass-approvals-and-sandbox"]
    return [*([str(launcher)] if launcher else []), *command, *flags, "--", prompt]


def kill(process):
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def stream_run(provider, command, workspace, minutes, policy):
    events = queue.Queue(maxsize=128)
    stop = threading.Event()

    def notify(item):
        while not stop.is_set():
            try:
                events.put(item, timeout=.1)
                break
            except queue.Full:
                pass

    def read(output):
        try:
            for line in output:
                if stop.is_set():
                    break
                try:
                    data = json.loads(line)
                except ValueError:
                    continue
                if isinstance(data, dict):
                    notify(data)
        finally:
            notify(None)

    usage = Usage()
    deadline = time.monotonic() + minutes * 60
    with subprocess.Popen(
        command, cwd=workspace, env=safe_env(), stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, errors="replace", start_new_session=True,
    ) as process:
        output = threading.Thread(target=read, args=(process.stdout,), daemon=True)
        output.start()
        try:
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise subprocess.TimeoutExpired(command, minutes * 60)
                item = events.get(timeout=remaining)
                if item is None:
                    break
                usage.update(provider, item)
                if provider == "codex" and (usage.turns or 0) > policy.max_turns:
                    raise SwarmError(f"Stopped Codex at the local {policy.max_turns}-turn limit.")
                if provider == "claude" and item.get("type") == "result" and item.get("is_error"):
                    raise SwarmError("Claude Code reported an unsuccessful run.")
                if item.get("type") == "turn.failed":
                    raise SwarmError("Codex reported an unsuccessful turn.")
            if process.wait(timeout=max(0, deadline - time.monotonic())):
                raise SwarmError(f"{provider} exited with code {process.returncode}.")
        except (subprocess.TimeoutExpired, queue.Empty):
            raise SwarmError(f"Stopped {provider} at the local {minutes}-minute limit.") from None
        finally:
            stop.set()
            kill(process)
            process.wait()
            output.join(timeout=1)
    return usage


def run_provider(provider, prompt, workspace, task_id, minutes, policy, swarm, launcher=None):
    if provider == "fake":
        output = workspace.resolve() / "SWARM-FAKE-RESULT.md"
        try:
            with output.open("x", encoding="utf-8") as result:
                result.write("Fake agent result for local testing.\n")
        except FileExistsError:
            raise SwarmError("Refusing to overwrite an existing fake agent output.") from None
        return Usage(0, 0, 1)
    with tempfile.TemporaryDirectory(prefix="swarm-config-") as config:
        command = provider_command(provider, prompt, workspace, task_id, policy, Path(config), swarm, launcher)
        return stream_run(provider, command, workspace, minutes, policy)
