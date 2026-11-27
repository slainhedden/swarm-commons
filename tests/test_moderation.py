import pytest
from fastapi.testclient import TestClient
from support import ADMIN, approve, test_app
from test_api import PREFIX, contributor, password_account, proposal


GOAL = {"title": "<b>Docs</b><script>alert(1)</script>", "description": "Public", "repo_url": "https://github.com/example/docs"}
TASK = {"title": "Write docs", "description": "Review setup", "criteria": "Check references"}


def test_proposal_approval_note_reports_and_ban(tmp_path):
    with TestClient(test_app(tmp_path / "db.sqlite3", seed=False)) as browser:
        owner = password_account(browser, "owner")
        worker = contributor(browser, "worker")
        created = browser.post(f"{PREFIX}/goals", json=GOAL, headers=owner).json()
        goal = created["id"]
        assert created["visibility"] == "pending" and created["title"] == "Docs"
        assert browser.get(f"{PREFIX}/goals").json() == []
        assert browser.get(f"{PREFIX}/goals/{goal}").status_code == 404
        assert browser.get(f"{PREFIX}/goals/{goal}", headers=owner).status_code == 200
        decision = {"action": "approve", "reason": "Reviewed"}
        assert browser.post(f"{PREFIX}/moderation/goals/{goal}", json=decision, headers=owner).status_code == 403
        approve(browser, "goals", goal)
        task = browser.post(f"{PREFIX}/goals/{goal}/tasks", json=TASK, headers=worker).json()["id"]
        assert browser.get(f"{PREFIX}/tasks?available=true").json() == []
        assert browser.post(f"{PREFIX}/tasks/{task}/claim", headers=worker).status_code == 409
        assert browser.post(f"{PREFIX}/moderation/tasks/{task}", json=decision, headers=owner).status_code == 200
        assert browser.post(f"{PREFIX}/tasks/{task}/claim", headers=worker).status_code == 200
        note = browser.post(f"{PREFIX}/goals/{goal}/notes", json={"body": "Untrusted note"}, headers=worker).json()["id"]
        reported = browser.post(f"{PREFIX}/notes/{note}/report", json={"reason": "Abuse"}, headers=owner)
        assert reported.status_code == 201
        assert browser.get(f"{PREFIX}/moderation/queue", headers=ADMIN).json()["reports"][0]["item_id"] == note
        assert browser.post(f"{PREFIX}/moderation/notes/{note}", json={
            "action": "hide", "reason": "Removed",
        }, headers=ADMIN).status_code == 200
        assert browser.get(f"{PREFIX}/goals/{goal}/notes").json() == []
        assert browser.post(f"{PREFIX}/moderation/contributors/worker/ban", json={
            "reason": "Account abuse",
        }, headers=ADMIN).status_code == 200
        assert browser.get(f"{PREFIX}/me", headers=worker).status_code == 401
        assert browser.get(f"{PREFIX}/tasks/{task}").status_code == 404


def test_limits_vote_age_locking_and_pagination(tmp_path):
    clock = [1000]
    with TestClient(test_app(tmp_path / "db.sqlite3", seed=False, clock=lambda: clock[0], vote_age=60,
                             signup_limit=3, write_limit=12)) as browser:
        voter = password_account(browser, "voter")
        token_only = contributor(browser, "worker")
        assert browser.post(f"{PREFIX}/contributors", json={"handle": "admin"}).status_code == 409
        assert browser.post(f"{PREFIX}/contributors", json={"handle": "additional"}).status_code == 429
        goal, _ = proposal(browser, voter)
        assert browser.post(f"{PREFIX}/goals/{goal}/vote", headers=voter).status_code == 403
        clock[0] += 61
        assert browser.post(f"{PREFIX}/goals/{goal}/vote", headers=token_only).status_code == 403
        assert browser.post(f"{PREFIX}/goals/{goal}/vote", headers=voter).json()["votes"] == 1
        assert browser.delete(f"{PREFIX}/goals/{goal}/vote", headers=voter).json()["votes"] == 0
        assert browser.post(f"{PREFIX}/threads", headers=voter, content=b"a" * 65537).status_code == 413
        ids = []
        for title in ("A", "B"):
            ids.append(browser.post(f"{PREFIX}/threads", headers=voter, json={"title": title, "body": "A replyable topic"}).json()["id"])
        assert browser.get(f"{PREFIX}/threads?limit=1&page=2").json()[0]["id"] == ids[0]
        assert browser.post(f"{PREFIX}/moderation/threads/{ids[0]}", headers=ADMIN, json={
            "action": "lock", "reason": "Pause",
        }).status_code == 200
        assert browser.post(f"{PREFIX}/threads/{ids[0]}/comments", headers=voter, json={"body": "Reply"}).status_code == 409
        calls = [browser.post(f"{PREFIX}/threads", headers=token_only, json={"title": "Post", "body": "Content"}).status_code
                 for _ in range(12)]
        assert 429 in calls
        for _ in range(2):
            assert browser.post(f"{PREFIX}/goals", json=GOAL, headers=voter).status_code == 201
        assert browser.post(f"{PREFIX}/goals", json=GOAL, headers=voter).status_code == 429


@pytest.mark.parametrize("trust_proxy", (False, True))
def test_railway_rate_limits_use_edge_ip_only_when_configured(tmp_path, monkeypatch, trust_proxy):
    monkeypatch.setenv("SWARM_TRUST_RAILWAY_CLIENT_IP", "1" if trust_proxy else "0")
    with TestClient(test_app(tmp_path / "db.sqlite3", seed=False, clock=lambda: 1000, signup_limit=1)) as browser:
        def signup(handle, ip):
            return browser.post(f"{PREFIX}/contributors", json={"handle": handle}, headers={"X-Real-IP": ip}).status_code

        assert signup("first", "192.0.2.1") == 201
        assert signup("second", "192.0.2.1") == 429
        assert signup("third", "192.0.2.2") == (201 if trust_proxy else 429)
        assert signup("fourth", "invalid") == (201 if trust_proxy else 429)
        assert signup("fifth", "also-invalid") == 429


def test_cors_headers_on_rejected_writes(tmp_path, monkeypatch):
    origin = "http://localhost:5185"
    monkeypatch.setenv("SWARM_CORS_ORIGINS", origin)
    with TestClient(test_app(tmp_path / "db.sqlite3", seed=False, clock=lambda: 1000, signup_limit=1)) as browser:
        account = {"username": "reader", "password": "a unique passphrase"}
        assert browser.post(f"{PREFIX}/auth/register", json=account).status_code == 201
        headers = {"Origin": origin}
        rate_limited = browser.post(f"{PREFIX}/auth/login", headers=headers, json=account)
        too_large = browser.post(f"{PREFIX}/threads", headers=headers, content=b"a" * 65537)
        csrf_rejected = browser.post(f"{PREFIX}/goals", headers=headers, json=GOAL)
        for response, status in ((rate_limited, 429), (too_large, 413), (csrf_rejected, 403)):
            assert response.status_code == status
            assert response.headers["Access-Control-Allow-Origin"] == origin
        assert rate_limited.headers["Retry-After"] == "60"
        denied = browser.post(f"{PREFIX}/auth/login", headers={"Origin": "https://unrelated.example"}, json=account)
        assert denied.status_code == 429
        assert "Access-Control-Allow-Origin" not in denied.headers


def test_goal_sharing_csrf_inline_forms_and_watch_scope(tmp_path):
    with TestClient(test_app(tmp_path / "db.sqlite3", seed=False)) as browser:
        proposer = contributor(browser, "writer")
        first, task = proposal(browser, proposer)
        second, _ = proposal(browser, proposer)
        assert browser.post(f"{PREFIX}/tasks/{task}/claim", headers=proposer).status_code == 200
        assert browser.post(f"{PREFIX}/tasks/{task}/heartbeat", headers=proposer).status_code == 200
        assert browser.get(f"{PREFIX}/stats?goal_id={first}").json()["agents_running"] == 1
        assert browser.get(f"{PREFIX}/stats?goal_id={second}").json()["agents_running"] == 0
        assert "Local install and contribution instructions" in browser.get(f"/goals/{second}").text
        assert "sh install.sh ." in browser.get("/contribute").text
        guest = browser.get(f"/goals/{first}")
        assert "Sign in to vote" in guest.text and "Copy link" in guest.text
        joined = browser.post("/join", data={"action": "register", "username": "reader",
                                             "password": "safe unique passphrase", "next": f"/goals/{first}"},
                              follow_redirects=False)
        assert joined.status_code == 303 and joined.headers["location"] == f"/goals/{first}"
        origin = {"Origin": "https://unrelated.example"}
        assert browser.post(f"/vote/goals/{first}", headers=origin).status_code == 403
        assert browser.post(f"/vote/goals/{first}").status_code == 200
        assert "Voted · Remove" in browser.get(f"/goals/{first}").text
        assert browser.post(f"/vote/goals/{first}?remove=true").status_code == 200
        assert "Voted · Remove" not in browser.get(f"/goals/{first}").text
        note = browser.post(f"/goals/{first}/notes", data={"body": "  "})
        assert note.status_code == 422 and "Enter a note" in note.text and "<textarea" in note.text
        discussion = browser.post("/forum", data={"title": "Draft stays", "body": "  "})
        assert discussion.status_code == 422 and "Draft stays" in discussion.text
        schema = browser.get("/openapi.json").json()
        assert schema["components"]["securitySchemes"]["SwarmBearer"]["scheme"] == "bearer"
        assert schema["paths"][f"{PREFIX}/goals"]["post"]["security"]
        assert schema["paths"][f"{PREFIX}/goals/{{goal_id}}"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
        assert f"{PREFIX}/auth/github" not in schema["paths"]


def test_login_error_keeps_the_username_at_sign_in(tmp_path):
    with TestClient(test_app(tmp_path / "db.sqlite3", seed=True)) as browser:
        assert "not an invitation" in browser.get("/goals/1").text
        assert "password of at least 12 characters" in browser.get("/join").text
        password_account(browser, "reader")
        response = browser.post("/join", data={"action": "login", "username": "reader",
                                              "password": "wrong passphrase"})
        assert response.status_code == 400
        registration, sign_in = response.text.split("<h2>Sign in</h2>", 1)
        assert 'role="alert"' not in registration
        assert 'role="alert"' in sign_in
        assert 'value="reader"' in sign_in
        assert "autofocus" in sign_in
        assert "wrong passphrase" not in response.text


def test_claim_cap_release_and_stale_pr(tmp_path):
    with TestClient(test_app(tmp_path / "db.sqlite3", seed=False, claim_cap=1, pr_checker=lambda *_: "invalid")) as browser:
        owner = contributor(browser, "owner")
        goal, first = proposal(browser, owner)
        second = browser.post(f"{PREFIX}/goals/{goal}/tasks", json=TASK, headers=owner).json()["id"]
        approve(browser, "tasks", second)
        assert browser.post(f"{PREFIX}/tasks/{first}/claim", headers=owner).status_code == 200
        assert browser.post(f"{PREFIX}/tasks/{second}/claim", headers=owner).status_code == 409
        assert browser.post(f"{PREFIX}/tasks/{first}/submit", headers=owner,
                            json={"pr_url": "https://github.com/example/docs/pull/1", "summary": "Old PR"}).status_code == 422
        assert browser.post(f"{PREFIX}/tasks/{first}/release", headers=owner).json()["status"] == "open"
        assert browser.post(f"{PREFIX}/tasks/{second}/claim", headers=owner).status_code == 200
