import time
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from fastapi.testclient import TestClient
from support import approve, live_server, test_app

from swarm_commons import server
from swarm_commons.store import connect, database


PREFIX = "/api/v1"


@pytest.fixture
def app(tmp_path):
    now = [1000]
    with TestClient(test_app(tmp_path / "test.sqlite3", seed=False,
                               clock=lambda: now[0], lease_seconds=120)) as browser:
        yield browser, now


def contributor(browser, handle):
    response = browser.post(f"{PREFIX}/contributors", json={"handle": handle})
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['token']}"}


def password_account(browser, handle):
    response = browser.post(f"{PREFIX}/auth/register", json={"username": handle, "password": "a unique passphrase"})
    assert response.status_code == 201, response.text
    browser.cookies.clear()
    return {"Authorization": f"Bearer {response.json()['token']}"}


def proposal(browser, author, label="Test"):
    goal = browser.post(f"{PREFIX}/goals", headers=author, json={
        "title": label, "description": "A public goal", "repo_url": "https://github.com/example/docs",
    })
    assert goal.status_code == 201, goal.text
    goal_id = goal.json()["id"]
    approve(browser, "goals", goal_id)
    task = browser.post(f"{PREFIX}/goals/{goal_id}/tasks", headers=author, json={
        "title": "Write documentation", "description": "Update the README", "criteria": "Review the instructions",
    })
    assert task.status_code == 201, task.text
    approve(browser, "tasks", task.json()["id"])
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


def test_web_token_sign_in_and_sign_out_preserves_cli_session(app):
    browser, _ = app
    cli_headers = contributor(browser, "token-owner")
    token = cli_headers["Authorization"].split()[1]
    assert browser.post("/join", data={"action": "token", "token": token}, follow_redirects=False).status_code == 303
    web_token = browser.cookies.get("swarm_session")
    assert browser.get(f"{PREFIX}/me").json()["handle"] == "token-owner"
    assert browser.post("/sign-out", follow_redirects=False).status_code == 303
    assert browser.get(f"{PREFIX}/me", headers=cli_headers).status_code == 200
    assert browser.get(f"{PREFIX}/me", headers={"Authorization": f"Bearer {web_token}"}).status_code == 401


def test_optional_auth_rejects_invalid_bearer_but_accepts_anonymous_reads(tmp_path, monkeypatch):
    origin = "http://localhost:5185"
    monkeypatch.setenv("SWARM_CORS_ORIGINS", origin)
    now = [1000]
    with TestClient(test_app(tmp_path / "test.sqlite3", seed=True, clock=lambda: now[0])) as browser:
        path = f"{PREFIX}/goals"
        origin_header = {"Origin": origin}
        anonymous = browser.get(path, headers=origin_header).raise_for_status()
        assert anonymous.json()[0]["viewer_voted"] is False

        def check_rejected(authorization):
            headers = {**origin_header, "Authorization": authorization}
            response = browser.get(path, headers=headers)
            required = browser.get(f"{PREFIX}/me", headers=headers)
            assert response.status_code == required.status_code == 401
            assert response.json() == required.json()
            assert response.headers["WWW-Authenticate"] == required.headers["WWW-Authenticate"] == "Bearer"
            assert response.headers["Access-Control-Allow-Origin"] == origin

        account = {"username": "casey", "password": "a unique passphrase"}
        registered = browser.post(f"{PREFIX}/auth/register", json=account).raise_for_status()
        first_token = registered.json()["token"]
        check_rejected("Bearer")
        check_rejected("bearer invalid")
        assert browser.post(f"{PREFIX}/auth/logout").status_code == 200
        check_rejected(f"Bearer {first_token}")

        logged_in = browser.post(f"{PREFIX}/auth/login", json=account).raise_for_status()
        second_token = logged_in.json()["token"]
        now[0] += 31 * 24 * 3600
        check_rejected(f"Bearer {second_token}")
        assert browser.cookies.get("swarm_session") is not None
        stale_cookie = browser.get(path, headers=origin_header).raise_for_status()
        assert stale_cookie.json()[0]["viewer_voted"] is False
        assert browser.get(f"{PREFIX}/me").status_code == 401


def test_voting_progress_and_submission(app):
    browser, _ = app
    author = contributor(browser, "river")
    worker = password_account(browser, "casey")
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
    submitted = browser.post(f"{PREFIX}/tasks/{task}/submit", headers=worker, json=data).json()
    assert submitted["status"] == "submitted"
    assert browser.post(f"{PREFIX}/tasks/{task}/done", headers=worker).status_code == 403
    assert browser.post(f"{PREFIX}/tasks/{task}/done", headers=author).status_code == 409
    assert browser.post(f"{PREFIX}/tasks/{task}/reviews", headers=author,
                        json={"submission_id": submitted["submission_id"], "approved": True,
                              "summary": "Independently checked the PR."}).status_code == 201
    assert browser.post(f"{PREFIX}/tasks/{task}/done", headers=author).json()["status"] == "done"
    assert browser.get(f"{PREFIX}/goals/{goal}/progress").json()["percent_done"] == 100
    assert browser.get(f"{PREFIX}/goals/featured").json()["id"] == first
    assert browser.get(f"{PREFIX}/leaderboard").json() == [{"handle": "casey", "contributions": 1, "done": 1}]


def test_viewer_vote_state_for_public_reads_and_vote_responses(app):
    browser, _ = app
    author = contributor(browser, "river")
    voter = password_account(browser, "casey")
    goal, task = proposal(browser, author)
    thread = browser.post(f"{PREFIX}/threads", headers=author, json={
        "goal_id": goal, "title": "Discussion", "body": "Details",
    }).json()["id"]
    comment = browser.post(f"{PREFIX}/threads/{thread}/comments", headers=author, json={"body": "Reply"}).json()["id"]
    targets = (f"goals/{goal}", f"tasks/{task}", f"threads/{thread}", f"comments/{comment}")

    def check_reads(expected, headers=None):
        for collection, detail, item_id in (
            ("goals", targets[0], goal), ("tasks", targets[1], task), ("threads", targets[2], thread),
        ):
            listed = browser.get(f"{PREFIX}/{collection}", headers=headers).raise_for_status()
            item = next(item for item in listed.json() if item["id"] == item_id)
            assert item["viewer_voted"] is expected
            response = browser.get(f"{PREFIX}/{detail}", headers=headers).raise_for_status()
            assert response.headers["Cache-Control"] == "private, no-store"
            assert response.json()["viewer_voted"] is expected
            if collection == "threads":
                assert response.json()["comments"][0]["viewer_voted"] is expected
        assert browser.get(f"{PREFIX}/goals/featured", headers=headers).json()["viewer_voted"] is expected

    for target in reversed(targets):
        updated = browser.post(f"{PREFIX}/{target}/vote", headers=voter).raise_for_status().json()
        assert updated["votes"] == 1 and updated["viewer_voted"] is True
        if target == targets[2]:
            assert updated["comments"][0]["viewer_voted"] is True
    check_reads(False)
    check_reads(False, author)
    check_reads(True, voter)
    browser.post(f"{PREFIX}/auth/login", json={
        "username": "casey", "password": "a unique passphrase",
    }).raise_for_status()
    check_reads(True)
    for target in targets:
        updated = browser.delete(f"{PREFIX}/{target}/vote").raise_for_status().json()
        assert updated["votes"] == 0 and updated["viewer_voted"] is False
    check_reads(False)


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


def test_event_stream_limits_concurrent_clients_and_releases_slot(app, monkeypatch):
    browser, _ = app
    monkeypatch.setattr(server, "MAX_EVENT_STREAMS", 1)
    with live_server(browser.app) as url, httpx.Client(timeout=5) as client:
        path = f"{url}{PREFIX}/events/stream"
        with client.stream("GET", path) as first:
            assert first.status_code == 200
            lines = first.iter_lines()
            assert next(lines) == ": keepalive"
            with client.stream("GET", path) as second:
                assert second.status_code == 503
                assert "Retry-After" in second.headers
        deadline = time.monotonic() + 3
        while True:
            with client.stream("GET", path) as reopened:
                if reopened.status_code == 200:
                    break
                assert reopened.status_code == 503 and time.monotonic() < deadline
            time.sleep(0.02)


def test_thread_replies_paginate_and_post_redirects_to_reply(app):
    browser, now = app
    author = password_account(browser, "river")
    thread = browser.post(f"{PREFIX}/threads", headers=author, json={"title": "Plan", "body": "Discuss"}).json()["id"]
    engine = database(browser.app.state.test_path)
    with connect(engine, write=True) as db:
        for index in range(100):
            db.execute("INSERT INTO comments (thread_id, author, body, created_at) VALUES (?, ?, ?, ?)",
                       (thread, "river", f"Reply {index + 1}", now[0]))
    engine.dispose()
    browser.cookies.set("swarm_session", author["Authorization"].split()[1])
    result = browser.post(f"/forum/{thread}/comments", data={"body": "Reply 101"}, follow_redirects=False)
    assert result.status_code == 303
    first = browser.get(f"{PREFIX}/threads/{thread}").json()
    assert len(first["comments"]) == 100 and first["comments"][0]["body"] == "Reply 1"
    second = browser.get(f"{PREFIX}/threads/{thread}?page=2").json()
    assert [comment["body"] for comment in second["comments"]] == ["Reply 101"]
    comment = second["comments"][0]["id"]
    assert result.headers["location"] == f"/forum/{thread}?page=2#comment-{comment}"
    assert f'id="comment-{comment}"' in browser.get(result.headers["location"]).text
    assert 'href="?page=2"' in browser.get(f"/forum/{thread}").text
    vote = browser.post(f"/vote/comments/{comment}", follow_redirects=False)
    assert vote.headers["location"] == result.headers["location"]


def test_notes_subtasks_forum_and_activity(app):
    browser, _ = app
    author = password_account(browser, "river")
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
