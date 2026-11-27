import json
import sys
from contextlib import nullcontext
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from support import ADMIN, approve, test_app

from swarm_commons import guards, verification
from swarm_commons.client import SwarmError, SwarmUnavailable
from swarm_commons.local import Policy, usage_reservation
from swarm_commons.providers import provider_command, run_provider, stream_run
from test_api import PREFIX, contributor, proposal


def test_dependencies_handoff_and_quorum(tmp_path):
    app = test_app(tmp_path / "test.sqlite3", seed=False, review_quorum=2)
    with TestClient(app) as browser:
        author = contributor(browser, "author")
        builder = contributor(browser, "builder")
        reviewer = contributor(browser, "reviewer")
        goal, first = proposal(browser, author)
        another_goal, another_task = proposal(browser, author, "Unrelated")
        payload = {"title": "Follow-up", "description": "Continue setup", "criteria": "Review", "depends_on": [first]}
        assert browser.post(f"{PREFIX}/goals/{another_goal}/tasks", headers=author, json=payload).status_code == 422
        second = browser.post(f"{PREFIX}/goals/{goal}/tasks", headers=author, json=payload).json()
        approve(browser, "tasks", second["id"])
        assert second["depends_on"] == [first] and not second["ready"]
        assert browser.post(f"{PREFIX}/tasks/{second['id']}/claim", headers=builder).status_code == 409
        assert [row["id"] for row in browser.get(f"{PREFIX}/tasks?goal_id={goal}&available=true").json()] == [first]
        assert browser.post(f"{PREFIX}/tasks/{first}/claim", headers=builder).status_code == 200
        pr = "https://github.com/example/docs/pull/2"
        submission = {"pr_url": pr, "summary": "Done", "handoff": {
            "diff_url": f"{pr}/files", "tests": [{"command": "pytest", "outcome": "passed"}],
            "files": ["README.md"], "output_tokens": 47, "open_questions": ["Cover Windows?"],
        }}
        submitted = browser.post(f"{PREFIX}/tasks/{first}/submit", headers=builder, json=submission).json()
        assert submitted["handoff"]["open_questions"] == ["Cover Windows?"]
        review = {"approved": True, "summary": "Confirmed against the PR.",
                  "submission_id": submitted.get("submission_id")}
        route = f"{PREFIX}/tasks/{first}/reviews"
        assert browser.post(route, headers=builder, json=review).status_code == 403
        assert browser.post(route, headers=reviewer, json=review).status_code == 201
        assert browser.post(route, headers=reviewer, json=review).status_code == 409
        assert browser.post(f"{PREFIX}/tasks/{first}/done", headers=author).status_code == 409
        assert browser.post(route, headers=author, json=review).status_code == 201
        assert browser.post(f"{PREFIX}/tasks/{first}/done", headers=author).status_code == 200
        assert browser.get(f"{PREFIX}/tasks/{second['id']}").json()["ready"]
        assert browser.get(f"{PREFIX}/goals/{goal}").json()["status"] == "open"
        assert browser.post(f"{PREFIX}/tasks/{second['id']}/claim", headers=builder).status_code == 200
        submission["pr_url"] = "https://github.com/example/docs/pull/3"
        submission["handoff"]["diff_url"] = submission["pr_url"] + "/files"
        submission["handoff"]["tests"][0]["outcome"] = "failed"
        replacement = browser.post(f"{PREFIX}/tasks/{second['id']}/submit", headers=builder, json=submission)
        assert replacement.status_code == 200
        review["submission_id"] = replacement.json().get("submission_id")
        for identity in (reviewer, author):
            assert browser.post(f"{PREFIX}/tasks/{second['id']}/reviews", headers=identity, json=review).status_code == 201
        assert "successful test results" in browser.post(f"{PREFIX}/tasks/{second['id']}/done", headers=author).text
        assert another_task != first


def test_review_rejects_a_previous_submission_even_for_the_same_pr(tmp_path):
    with TestClient(test_app(tmp_path / "db.sqlite3", seed=False, clock=lambda: 1000)) as browser:
        author = contributor(browser, "author")
        builder = contributor(browser, "builder")
        _, task = proposal(browser, author)
        route = f"{PREFIX}/tasks/{task}"
        submission = {"pr_url": "https://github.com/example/docs/pull/2", "summary": "Ready"}
        assert browser.post(f"{route}/claim", headers=builder).status_code == 200
        original = browser.post(f"{route}/submit", headers=builder, json=submission).json()
        assert browser.post(f"{PREFIX}/moderation/tasks/{task}", headers=ADMIN,
                            json={"action": "reject_submission", "reason": "Needs more evidence"}).status_code == 200
        assert browser.post(f"{route}/claim", headers=builder).status_code == 200
        current = browser.post(f"{route}/submit", headers=builder, json=submission).json()
        review = {"approved": True, "summary": "Reviewed", "submission_id": original.get("submission_id")}
        assert browser.post(f"{route}/reviews", headers=author, json=review).status_code == 409
        assert browser.get(route).json()["reviews"] == []
        review["submission_id"] = current["submission_id"]
        assert browser.post(f"{route}/reviews", headers=author, json=review).status_code == 201


def test_path_reservations_span_goals_and_expire(tmp_path):
    now = [1000]
    with TestClient(test_app(tmp_path / "test.sqlite3", seed=False, clock=lambda: now[0])) as browser:
        alice = contributor(browser, "alice")
        bob = contributor(browser, "bobby")
        _, first = proposal(browser, alice)
        _, second = proposal(browser, bob, "Same repo, different goal")
        for auth, task in ((alice, first), (bob, second)):
            assert browser.post(f"{PREFIX}/tasks/{task}/claim", headers=auth).status_code == 200
        lease1 = f"{PREFIX}/tasks/{first}/path-leases"
        lease2 = f"{PREFIX}/tasks/{second}/path-leases"
        check = f"{PREFIX}/tasks/{second}/paths/check"
        assert browser.post(lease1, headers=alice, json={"path": "src/**", "ttl_seconds": 30}).status_code == 201
        assert browser.post(lease2, headers=bob, json={"path": "src/tool.py", "mode": "shared"}).status_code == 409
        assert browser.post(lease2, headers=bob, json={"path": "../.git"}).status_code == 422
        conflicts = browser.post(check, headers=bob, json={"paths": ["README.md", "src/tool.py"]}).json()["conflicts"]
        assert conflicts == [{"path": "src/tool.py", "reserved_path": "src/**", "task_id": first}]
        now[0] += 30
        assert browser.post(check, headers=bob, json={"paths": ["src/tool.py"]}).json()["conflicts"] == []
        assert browser.post(lease1, headers=alice, json={"path": "src/**", "mode": "shared"}).status_code == 201
        assert browser.post(lease2, headers=bob, json={"path": "src/**", "mode": "shared"}).status_code == 201


def test_guard_blocks_conflicts_and_only_network_failure_opens(monkeypatch, capsys):
    class Client:
        def post(self, path, **kwargs):
            assert path == "tasks/3/paths/check"
            return {"conflicts": [{"path": kwargs["paths"][0], "task_id": 4}]}

    monkeypatch.setattr(guards.Client, "from_config", lambda: nullcontext(Client()))
    with pytest.raises(SwarmError, match="reserved by task #4"):
        guards.verify_paths(3, ["src/tool.py"])

    def fail(error):
        raise error("test")

    monkeypatch.setattr(guards.Client, "from_config", lambda: fail(SwarmUnavailable))
    guards.verify_paths(3, ["src/tool.py"])
    assert "allowing operation" in capsys.readouterr().err
    monkeypatch.setattr(guards.Client, "from_config", lambda: fail(SwarmError))
    with pytest.raises(SwarmError):
        guards.verify_paths(3, ["src/tool.py"])


def test_usage_policy_honors_local_hours_and_daily_reservations(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_STATE_HOME", str(tmp_path))
    policy = Policy(task_minutes=10, daily_minutes=10, allowed_start_hour=22, allowed_end_hour=6)
    with pytest.raises(SwarmError, match="this hour"), usage_reservation(policy, 1, now=lambda: datetime(2026, 1, 1, 12)):
        pytest.fail("disallowed hour")
    now = lambda: datetime(2026, 1, 1, 23)
    with usage_reservation(policy, 10, now=now):
        with pytest.raises(SwarmError, match="daily"), usage_reservation(policy, 1, now=now):
            pytest.fail("overlapping reservation")


def test_provider_json_limits_and_sandbox_commands(tmp_path, monkeypatch):
    policy = Policy(max_turns=1, claude_max_budget_usd=2.5)
    claude = provider_command("claude", "task", tmp_path, 1, policy, tmp_path, "swarm")
    assert "--restricted" in claude and "--bare" not in claude
    assert "--max-budget-usd" in claude and "2.5" in claude
    assert "PreToolUse" in json.loads((tmp_path / "settings.json").read_text())["hooks"]
    codex = provider_command("codex", "task", tmp_path, 1, policy, tmp_path, "swarm")
    assert "workspace-write" in codex and "--dangerously-bypass-approvals-and-sandbox" not in codex
    external = provider_command("codex", "task", tmp_path, 1, policy, tmp_path, "swarm", "/trusted/launcher")
    assert external[0] == "/trusted/launcher" and "--dangerously-bypass-approvals-and-sandbox" in external
    monkeypatch.setenv("TEST_SECRET_NOT_FOR_AGENT", "hidden")
    script = """import json, os
assert 'TEST_SECRET_NOT_FOR_AGENT' not in os.environ
print(json.dumps({'type': 'turn.started'}))
print(json.dumps({'type': 'turn.completed', 'usage': {'input_tokens': 18, 'output_tokens': 7}}))"""
    usage = stream_run("codex", [sys.executable, "-c", script], tmp_path, 1, policy)
    assert (usage.turns, usage.input_tokens, usage.output_tokens) == (1, 18, 7)
    with pytest.raises(SwarmError, match="1-turn limit"):
        stream_run("codex", [sys.executable, "-c", script + "\nprint(json.dumps({'type':'turn.started'}))"], tmp_path, 1, policy)


def test_fake_provider_refuses_symlink_output(tmp_path):
    workspace = tmp_path / "worktree"
    workspace.mkdir()
    target = tmp_path / "untouched.md"
    target.write_text("original")
    (workspace / "SWARM-FAKE-RESULT.md").symlink_to(target)

    with pytest.raises(SwarmError, match="fake agent output"):
        run_provider("fake", "", workspace, 1, 1, Policy(), "swarm")
    assert target.read_text() == "original"


def test_verification_runs_only_in_locked_down_docker(tmp_path, monkeypatch):
    invocations = []

    def run(command, **kwargs):
        invocations.append(command)
        return type("Result", (), {"returncode": 0})()

    monkeypatch.setattr(verification.subprocess, "run", run)
    assert verification.verify(tmp_path, "trusted-image", "python -m pytest")[0]["outcome"] == "passed"
    assert "--network=none" in invocations[0] and "--read-only" in invocations[0] and "--cap-drop=ALL" in invocations[0]
    assert f"type=bind,source={tmp_path},target=/workspace,readonly" in invocations[0]
    assert invocations[1][0:3] == ("docker", "rm", "-f")
