from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from fastapi.testclient import TestClient
from support import live_server

from swarm_commons.server import create_app


PREFIX = "/api/v1"


@pytest.fixture
def app(tmp_path):
    now = [1000]
    with TestClient(create_app(tmp_path / "test.sqlite3", seed=False,
                               clock=lambda: now[0], lease_seconds=120)) as browser:
        yield browser, now


def contributor(browser, handle):
    response = browser.post(f"{PREFIX}/contributors", json={"handle": handle})
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['token']}"}


def proposal(browser, author, label="Test"):
    goal = browser.post(f"{PREFIX}/goals", headers=author, json={
        "title": label, "description": "A public goal", "repo_url": "https://github.com/example/docs",
    })
    assert goal.status_code == 201, goal.text
    goal_id = goal.json()["id"]
    task = browser.post(f"{PREFIX}/goals/{goal_id}/tasks", headers=author, json={
        "title": "Write documentation", "description": "Update the README", "criteria": "Review the instructions",
    })
    assert task.status_code == 201, task.text
    return goal_id, task.json()["id"]


def test_accounts_and_cors(app):
    browser, _ = app
    account = {"username": "casey", "password": "a unique passphrase"}
    created = browser.post(f"{PREFIX}/auth/register", json=account)
    assert created.status_code == 201
    assert "HttpOnly" in created.headers["set-cookie"]
    assert browser.get(f"{PREFIX}/me").json() == {"handle": "casey"}
    assert browser.post(f"{PREFIX}/auth/logout").json() == {"ok": True}
    assert browser.get(f"{PREFIX}/me", headers={"Authorization": f"Bearer {created.json()['token']}"}).status_code == 401
    assert browser.post(f"{PREFIX}/auth/login", json={**account, "password": "wrong password"}).status_code == 401
    assert browser.post(f"{PREFIX}/auth/login", json=account).json()["handle"] == "casey"
    assert browser.post(f"{PREFIX}/contributors", json={"handle": "casey"}).status_code == 409
    assert browser.get(f"{PREFIX}/auth/github").status_code == 404
    assert browser.options(f"{PREFIX}/goals", headers={
        "Origin": "https://preview.example", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization",
    }).headers["access-control-allow-origin"] == "*"


def test_voting_progress_and_submission(app):
    browser, _ = app
    author = contributor(browser, "river")
    worker = contributor(browser, "casey")
    first, _ = proposal(browser, author)
    goal, task = proposal(browser, author, "More docs")
    for path in (f"goals/{goal}", f"tasks/{task}"):
        assert browser.post(f"{PREFIX}/{path}/vote").status_code == 401
        for _ in range(2):
            assert browser.post(f"{PREFIX}/{path}/vote", headers=worker).json()["votes"] == 1
    assert browser.get(f"{PREFIX}/goals/featured").json()["id"] == goal
    assert browser.get(f"{PREFIX}/tasks?available=true").json()[0]["id"] == task
    assert browser.post(f"{PREFIX}/tasks/{task}/claim", headers=worker).json()["claimant"] == "casey"
    assert browser.get(f"{PREFIX}/tasks?goal_id={goal}&available=true").json() == []
    data = {"pr_url": "https://github.com/example/docs/pull/42", "summary": "Added examples",
            "handoff": {"files": ["README.md"], "tests": [{"command": "pytest", "outcome": "passed"}]}}
    assert browser.post(f"{PREFIX}/tasks/{task}/submit", headers=author, json=data).status_code == 409
    assert browser.post(f"{PREFIX}/tasks/{task}/submit", headers=worker, json={
        **data, "pr_url": "https://github.com/another/project/pull/1",
    }).status_code == 422
    assert browser.post(f"{PREFIX}/tasks/{task}/submit", headers=worker, json=data).json()["status"] == "submitted"
    assert browser.post(f"{PREFIX}/tasks/{task}/done", headers=worker).status_code == 403
    assert browser.post(f"{PREFIX}/tasks/{task}/done", headers=author).status_code == 409
    assert browser.post(f"{PREFIX}/tasks/{task}/reviews", headers=author,
                        json={"approved": True, "summary": "Independently checked the PR."}).status_code == 201
    assert browser.post(f"{PREFIX}/tasks/{task}/done", headers=author).json()["status"] == "done"
    assert browser.get(f"{PREFIX}/goals/{goal}/progress").json()["percent_done"] == 100
    assert browser.get(f"{PREFIX}/goals/featured").json()["id"] == first
    assert browser.get(f"{PREFIX}/leaderboard").json() == [{"handle": "casey", "contributions": 1, "done": 1}]


def test_claim_race_heartbeat_and_expiration(app):
    browser, now = app
    first = contributor(browser, "alfa")
    second = contributor(browser, "beta")
    _, task = proposal(browser, first)
    with ThreadPoolExecutor(2) as workers:
        responses = list(workers.map(
            lambda auth: browser.post(f"{PREFIX}/tasks/{task}/claim", headers=auth), [first, second],
        ))
    assert sorted(response.status_code for response in responses) == [200, 409]
    winner, other = (first, second) if responses[0].status_code == 200 else (second, first)
    assert browser.get(f"{PREFIX}/stats").json()["agents_running"] == 0
    now[0] += 60
    assert browser.post(f"{PREFIX}/tasks/{task}/heartbeat", headers=winner).json()["lease_until"] == 1180
    assert browser.get(f"{PREFIX}/stats").json()["agents_running"] == 1
    assert browser.post(f"{PREFIX}/tasks/{task}/heartbeat", headers=other).status_code == 409
    now[0] += 120
    assert browser.get(f"{PREFIX}/tasks/{task}").json()["status"] == "open"
    assert browser.post(f"{PREFIX}/tasks/{task}/claim", headers=other).status_code == 200


def test_notes_subtasks_forum_and_activity(app):
    browser, _ = app
    author = contributor(browser, "river")
    goal, task = proposal(browser, author)
    assert browser.post(f"{PREFIX}/goals/{goal}/notes", headers=author, json={"body": "Public finding"}).status_code == 201
    assert browser.get(f"{PREFIX}/goals/{goal}/notes").json()[0]["author"] == "river"
    proposed = browser.post(f"{PREFIX}/tasks/{task}/subtasks", headers=author, json={
        "tasks": [{"title": "Check macOS", "description": "Repeat setup", "criteria": "Record findings"}],
    })
    assert proposed.status_code == 201
    assert proposed.json()[0]["parent_id"] == task
    created = browser.post(f"{PREFIX}/threads", headers=author, json={"goal_id": goal, "title": "Plan", "body": "Discuss"})
    thread = created.json()["id"]
    assert created.status_code == 201
    assert browser.get(f"{PREFIX}/threads?general=true").json() == []
    reply = browser.post(f"{PREFIX}/threads/{thread}/comments", headers=author, json={"body": "I can help!"})
    assert reply.status_code == 201
    assert browser.post(f"{PREFIX}/comments/{reply.json()['id']}/vote", headers=author).json()["votes"] == 1
    assert browser.get(f"{PREFIX}/threads/{thread}").json()["comments"][0]["body"] == "I can help!"
    assert browser.post(f"{PREFIX}/tasks/{task}/claim", headers=author).status_code == 200
    event = browser.post(f"{PREFIX}/tasks/{task}/events", headers=author, json={"kind": "started", "summary": "Starting"})
    assert event.status_code == 201
    assert browser.get(f"{PREFIX}/activity?limit=1").json() == [event.json()]
    event_id = event.json()["id"]
    with live_server(browser.app) as url, httpx.stream(
        "GET", f"{url}{PREFIX}/events/stream", params={"goal_id": goal},
        headers={"Last-Event-ID": str(event_id - 1)}, timeout=5,
    ) as stream:
        assert stream.headers["content-type"].startswith("text/event-stream")
        assert next(stream.iter_lines()) == f"id: {event_id}"
    assert browser.get(f"/goals/{goal}").status_code == 200
    assert browser.get(f"/forum/{thread}").status_code == 200
    assert browser.get("/watch").status_code == 200
