import asyncio
import os
import subprocess
from contextlib import nullcontext
from pathlib import Path

from fastapi.testclient import TestClient

from swarm_commons import cli
from swarm_commons.mcp_tools import create_mcp
from swarm_commons.server import create_app


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
    task = client.post(f"goals/{goal['id']}/tasks", title="Add setup", description="Describe it", criteria="Be clear")
    return client, goal, task


def test_fake_run_against_local_bare_repo(tmp_path, monkeypatch, capsys):
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
    with TestClient(create_app(tmp_path / "test.sqlite3", seed=False)) as browser:
        client, _, task = setup_browser(browser)
        monkeypatch.setattr(cli.Client, "from_config", lambda: nullcontext(client))
        monkeypatch.setattr("builtins.input", lambda _: "n")
        assert cli.main(["run", str(task["id"]), "--agent", "fake"]) == 0
        assert client.get(f"tasks/{task['id']}")["status"] == "open"
        answers = iter(("y", "y", "Tested a fake agent"))
        monkeypatch.setattr("builtins.input", lambda _: next(answers))
        assert cli.main(["run", str(task["id"]), "--agent", "fake"]) == 0
        assert client.get(f"tasks/{task['id']}")["pr_url"] == "https://github.com/example/docs/pull/42"
        assert {item["kind"] for item in client.get("activity")} >= {"started", "finished", "submitted"}
        refs = git("for-each-ref", "--format=%(refname)", "refs/heads/swarm", cwd=remote).splitlines()
        assert len(refs) == 1
        assert "Fake agent result" in git("show", f"{refs[0]}:SWARM-FAKE-RESULT.md", cwd=remote)
        assert "Result reported to Swarm Commons." in capsys.readouterr().out


def test_mcp_tools_coordinate_with_the_api(tmp_path):
    with TestClient(create_app(tmp_path / "test.sqlite3", seed=False)) as browser:
        client, goal, task = setup_browser(browser)
        mcp = create_mcp(lambda: nullcontext(client))

        async def exercise():
            tags = {tool.name for tool in await mcp.list_tools()}
            assert tags == {"list_goals", "list_tasks", "get_task", "claim_task", "post_note",
                            "read_notes", "propose_subtasks", "submit_result"}
            await mcp.call_tool("claim_task", {"id": task["id"]})
            await mcp.call_tool("post_note", {"goal_id": goal["id"], "body": "Finding from MCP"})
            await mcp.call_tool("propose_subtasks", {"parent_id": task["id"], "tasks": [
                {"title": "Follow-up", "description": "Check the result", "criteria": "Verify setup"},
            ]})
            await mcp.call_tool("submit_result", {"id": task["id"], "pr_url": "https://github.com/example/docs/pull/1",
                                                  "summary": "MCP reports an existing PR"})

        asyncio.run(exercise())
        assert client.get(f"goals/{goal['id']}/notes")[0]["body"] == "Finding from MCP"
        assert client.get("tasks", available=True)[0]["parent_id"] == task["id"]
        assert client.get(f"tasks/{task['id']}")["status"] == "submitted"
