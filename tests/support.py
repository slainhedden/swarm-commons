import socket
import threading
import time
from contextlib import contextmanager

import uvicorn

from swarm_commons.accounts import token_hash
from swarm_commons.server import create_app
from swarm_commons.store import connect, database


TEST_ADMIN_TOKEN = "swarm_" + "a" * 43
ADMIN = {"Authorization": "Bearer " + TEST_ADMIN_TOKEN}


def test_app(path, **kwargs):
    kwargs.setdefault("vote_age", 0)
    kwargs.setdefault("pr_checker", lambda *_: "unverified")
    app = create_app(path, **kwargs)
    app.state.test_path = path
    return app


test_app.__test__ = False


def approve(browser, kind, item):
    engine = database(browser.app.state.test_path)
    with connect(engine, write=True) as db:
        db.execute("""
            INSERT INTO contributors (handle, role) VALUES ('test-admin', 'admin') ON CONFLICT DO NOTHING
        """)
        db.execute("INSERT INTO sessions (token_hash, handle) VALUES (?, 'test-admin') ON CONFLICT DO NOTHING",
                   (token_hash(TEST_ADMIN_TOKEN),))
    engine.dispose()
    response = browser.post(f"/api/v1/moderation/{kind}/{item}", headers=ADMIN,
                            json={"action": "approve", "reason": "Approved in test"})
    assert response.status_code == 200, response.text


@contextmanager
def live_server(app):
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        server = uvicorn.Server(uvicorn.Config(app, lifespan="off", log_level="error"))
        worker = threading.Thread(target=lambda: server.run(sockets=[listener]), daemon=True)
        worker.start()
        try:
            deadline = time.monotonic() + 5
            while not server.started and worker.is_alive() and time.monotonic() < deadline:
                time.sleep(.01)
            assert server.started
            yield f"http://127.0.0.1:{listener.getsockname()[1]}"
        finally:
            server.should_exit = True
            worker.join(5)
