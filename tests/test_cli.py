import asyncio
import json
import os
import subprocess
from contextlib import nullcontext

import httpx
import pytest
from fastapi.testclient import TestClient
from support import approve, live_server, test_app

from swarm_commons import cli
from swarm_commons.client import save_config
from swarm_commons.mcp_tools import create_mcp


def git(*args, cwd):
    return subprocess.run(("git", *args), cwd=cwd, check=True, capture_output=True, text=True).stdout


class BrowserClient:
    def __init__(self, browser, headers):
        self.browser = browser
        self.headers = headers

    def get(self, path, **params):
        response = self.browser.get(f"/api/v1/{path}", params=params, headers=self.headers)
        assert response.is_success, response.text
        return response.json()

    def post(self, path, **data):
        response = self.browser.post(f"/api/v1/{path}", json=data, headers=self.headers)
        assert response.is_success, response.text
        return response.json()


def setup_browser(browser):
    token = browser.post("/api/v1/contributors", json={"handle": "example"}).json()["token"]
    client = BrowserClient(browser, {"Authorization": f"Bearer {token}"})
    goal = client.post("goals", title="Better docs", description="Document setup", repo_url="https://github.com/example/docs")
    approve(browser, "goals", goal["id"])
    task = client.post(f"goals/{goal['id']}/tasks", title="Add setup", description="Describe it", criteria="Be clear")
    approve(browser, "tasks", task["id"])
    return client, goal, task


def test_task_list_escapes_terminal_controls(monkeypatch, capsys):
    class Tasks:
        def get(self, path, **params):
            assert path == "tasks" and params == {"available": True}
            return [{"id": 1, "votes": 0, "title": "Title\x1b[2J", "goal_title": "Goal\r\nPrompt"}]

    monkeypatch.setattr(cli.Client, "from_config", lambda: nullcontext(Tasks()))
    assert cli.main(["tasks"]) == 0
    assert capsys.readouterr().out == "#1  ↑0  Title\\x1b[2J  (Goal\\r\\nPrompt)\n"


def test_run_rejects_private_repository_before_claim_or_clone(monkeypatch, capsys):
    class PrivateTask:
        def get(self, path):
            assert path == "tasks/1"
            return {"repo_url": "https://github.com/example/private"}

    monkeypatch.setattr(cli.Client, "from_config", lambda: nullcontext(PrivateTask()))

    def public_lookup(url, **options):
        assert url == "https://api.github.com/repos/example/private"
        assert options["trust_env"] is False and "auth" not in options
        return httpx.Response(404)

    monkeypatch.setattr(cli.httpx, "get", public_lookup)
    assert cli.main(["run", "1", "--agent", "fake"]) == 1
    assert "public GitHub repository" in capsys.readouterr().err


def test_fake_run_against_local_bare_repo(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(cli.httpx, "get", lambda *args, **kwargs: httpx.Response(200, json={"private": False}))
    remote = tmp_path / "remote.git"
    git("init", "--bare", "--initial-branch=main", str(remote), cwd=tmp_path)
    source = tmp_path / "source"
    git("init", "--initial-branch=main", str(source), cwd=tmp_path)
    (source / "README.md").write_text("# Test repo\n")
    config = tmp_path / "gitconfig"
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(config))
    git("config", "--global", "user.email", "contributor@example.invalid", cwd=tmp_path)
    git("config", "--global", "user.name", "Contributor", cwd=tmp_path)
    git("config", "--global", f"url.{remote}.insteadOf", "https://github.com/example/docs", cwd=tmp_path)
    git("add", "README.md", cwd=source)
    git("commit", "-m", "Initial", cwd=source)
    git("push", str(remote), "main", cwd=source)
    bin_path = tmp_path / "bin"
    bin_path.mkdir()
    gh = bin_path / "gh"
    gh.write_text('#!/bin/sh\ncase "$1" in\napi) echo example;;\npr) echo https://github.com/example/docs/pull/42;;\n*) exit 1;;\nesac\n')
    gh.chmod(0o755)
    monkeypatch.setenv("PATH", str(bin_path) + os.pathsep + os.environ["PATH"])
    monkeypatch.setenv("XDG_STATE_HOME", str(tmp_path / "state"))
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / "config"))
    app = test_app(tmp_path / "test.sqlite3", seed=False)
    with TestClient(app) as browser, live_server(app) as url:
        client, _, task = setup_browser(browser)
        save_config({"server": url, "token": client.headers["Authorization"].removeprefix("Bearer ")})
        with monkeypatch.context() as missing:
            which = cli.shutil.which
            missing.setattr(cli.shutil, "which", lambda name: None if name == "claude" else which(name))
            missing.setattr("builtins.input", lambda _: "y")
            assert cli.main(["run", str(task["id"]), "--agent", "claude"]) == 1
            assert "claude is not installed" in capsys.readouterr().err
            assert client.get(f"tasks/{task['id']}")["status"] == "open"
            assert "started" not in {event["kind"] for event in client.get("activity")}
        monkeypatch.setattr("builtins.input", lambda _: "n")
        assert cli.main(["run", str(task["id"]), "--agent", "fake"]) == 0
        assert client.get(f"tasks/{task['id']}")["status"] == "open"
        declined = iter(("y", "n"))
        monkeypatch.setattr("builtins.input", lambda _: next(declined))
        assert cli.main(["run", str(task["id"]), "--agent", "fake"]) == 0
        assert client.get(f"tasks/{task['id']}")["status"] == "open"
        assert "Released task" in capsys.readouterr().out
        answers = iter(("y", "y", "Tested a fake agent"))
        monkeypatch.setattr("builtins.input", lambda _: next(answers))
        assert cli.main(["run", str(task["id"]), "--agent", "fake"]) == 0
        completed = client.get(f"tasks/{task['id']}")
        assert completed["pr_url"] == "https://github.com/example/docs/pull/42"
        assert completed["handoff"]["files"] == ["SWARM-FAKE-RESULT.md"]
        assert completed["handoff"]["turns"] == 1
        worktree = next((tmp_path / "state" / "swarm-commons" / "workspaces").glob("*/worktree"))
        assert (worktree / ".git").is_file()
        assert {item["kind"] for item in client.get("activity")} >= {"started", "finished", "submitted"}
        events = [item for item in client.get("activity") if item["kind"] in {"started", "finished"}]
        assert events[0]["run_id"] == events[1]["run_id"]
        assert events[0]["run_id"] != events[2]["run_id"]
        refs = git("for-each-ref", "--format=%(refname)", "refs/heads/swarm", cwd=remote).splitlines()
        assert len(refs) == 1
        assert "Fake agent result" in git("show", f"{refs[0]}:SWARM-FAKE-RESULT.md", cwd=remote)
        assert "Result reported to Swarm Commons." in capsys.readouterr().out


def test_interrupted_run_reports_failed_status_and_reason(tmp_path):
    with TestClient(test_app(tmp_path / "test.sqlite3", seed=False)) as browser:
        client, goal, task = setup_browser(browser)
        client.post(f"tasks/{task['id']}/claim")
        with pytest.raises(KeyboardInterrupt), cli.report_run(client, task["id"], "fake"):
            raise KeyboardInterrupt
        failed, started = [item for item in client.get("activity") if item["kind"] in {"failed", "started"}]
        assert failed["kind"] == "failed"
        assert failed["summary"] == "Interrupted by contributor."
        assert failed["run_id"] == started["run_id"]
        watch = browser.get(f"/watch?goal_id={goal['id']}")
        assert 'event-failed' in watch.text and '<time' in watch.text
        assert f"Run {failed['run_id'][:8]}" in watch.text


def test_mcp_tools_coordinate_with_the_api(tmp_path):
    with TestClient(test_app(tmp_path / "test.sqlite3", seed=False)) as browser:
        client, goal, task = setup_browser(browser)
        mcp = create_mcp(lambda: nullcontext(client))

        async def exercise():
            tags = {tool.name for tool in await mcp.list_tools()}
            assert tags == {"list_goals", "list_tasks", "get_task", "claim_task", "post_note",
                            "read_notes", "propose_subtasks", "submit_result", "reserve_path"}
            await mcp.call_tool("claim_task", {"id": task["id"]})
            await mcp.call_tool("post_note", {"goal_id": goal["id"], "body": "Finding from MCP"})
            notes = await mcp.call_tool("read_notes", {"goal_id": goal["id"]})
            assert json.loads(notes[0].text)["trust"] == "untrusted"
            await mcp.call_tool("propose_subtasks", {"parent_id": task["id"], "tasks": [
                {"title": "Follow-up", "description": "Check the result", "criteria": "Verify setup"},
            ]})
            await mcp.call_tool("submit_result", {"id": task["id"], "pr_url": "https://github.com/example/docs/pull/1",
                                                  "summary": "MCP reports an existing PR",
                                                  "tests": [{"command": "pytest", "outcome": "passed"}]})

        asyncio.run(exercise())
        assert client.get(f"goals/{goal['id']}/notes")[0]["body"] == "Finding from MCP"
        assert client.get("tasks", available=True) == []
        assert client.get(f"tasks/{task['id']}")["status"] == "submitted"
        assert client.get(f"tasks/{task['id']}")["handoff"]["tests"] == [{"command": "pytest", "outcome": "passed"}]
