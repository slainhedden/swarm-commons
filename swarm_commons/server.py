import asyncio
import json
import os
import re
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, FastAPI, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field, StringConstraints, ValidationError
from sqlalchemy.exc import IntegrityError

from .accounts import password_hash, token_hash, verify_password
from .store import connect, database, initialize, migrate


ROOT = Path(__file__).parent
HANDLE = r"^[a-z0-9][a-z0-9_-]{1,38}$"
REPO = re.compile(r"https://github\.com/[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_.-]+")
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=140)]
Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]


class Signup(BaseModel):
    handle: Annotated[str, StringConstraints(pattern=HANDLE)]


class AccountInput(BaseModel):
    username: Annotated[str, StringConstraints(pattern=HANDLE)]
    password: Annotated[str, StringConstraints(min_length=12, max_length=128)]


class GoalInput(BaseModel):
    title: Title
    description: Body
    repo_url: Annotated[str, StringConstraints(strip_whitespace=True, max_length=250)]


class TaskInput(BaseModel):
    title: Title
    description: Body
    criteria: Body


class SubtasksInput(BaseModel):
    tasks: list[TaskInput] = Field(min_length=1, max_length=10)


class NoteInput(BaseModel):
    body: Body


class Submission(BaseModel):
    pr_url: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]
    summary: Body


class ThreadInput(BaseModel):
    goal_id: int | None = None
    title: Title
    body: Body


class EventInput(BaseModel):
    kind: Literal["started", "progress", "finished", "failed"]
    summary: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=280)]


def repo_url(value):
    normalized = value.rstrip("/").removesuffix(".git")
    if not REPO.fullmatch(normalized) or normalized.rsplit("/", 1)[1] in {".", ".."}:
        raise HTTPException(422, "Use a public repository URL such as https://github.com/org/repo.")
    return normalized


def require_row(row, kind):
    if row is None:
        raise HTTPException(404, f"{kind} not found.")
    return dict(row)


def create_app(db_path=None, *, seed=None, clock=time.time, lease_seconds=3600, database_url=None):
    path = Path(db_path or os.environ.get("SWARM_DB", "swarm.sqlite3"))
    database_url = database_url or (os.environ.get("DATABASE_URL") if db_path is None else None)
    engine = database(path, database_url)
    seed = os.environ.get("SWARM_SEED", "1") != "0" if seed is None else seed

    @asynccontextmanager
    async def lifespan(_):
        if not database_url:
            path.parent.mkdir(parents=True, exist_ok=True)
            migrate(engine)
        initialize(engine, seed, int(clock()), lease_seconds)
        try:
            yield
        finally:
            engine.dispose()

    app = FastAPI(title="Swarm Commons", lifespan=lifespan)
    origins = [item.strip() for item in os.environ.get("SWARM_CORS_ORIGINS", "*").split(",") if item.strip()]
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"],
                       allow_headers=["Authorization", "Content-Type", "Last-Event-ID"],
                       allow_credentials=bool(origins and "*" not in origins))
    api = APIRouter(prefix="/api/v1")
    templates = Jinja2Templates(directory=ROOT / "templates")
    app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")

    def session(db, handle, *, permanent=False):
        token = "swarm_" + secrets.token_urlsafe(32)
        expires = None if permanent else int(clock()) + 30 * 24 * 3600
        db.execute("INSERT INTO sessions VALUES (?, ?, ?)", (token_hash(token), handle, expires))
        return {"handle": handle, "token": token}

    def signup(handle, password=None):
        if handle == "demo" or handle.startswith("demo-"):
            raise HTTPException(409, "That handle is reserved.")
        hashed = password_hash(password) if password is not None else None
        try:
            with connect(engine, write=True) as db:
                db.execute("INSERT INTO contributors VALUES (?, ?)", (handle, hashed))
                return session(db, handle, permanent=password is None)
        except IntegrityError:
            raise HTTPException(409, "That handle is already taken.") from None

    def authenticate(data):
        with connect(engine) as db:
            row = db.execute("SELECT password_hash FROM contributors WHERE handle = ?", (data.username,)).fetchone()
        if not verify_password(data.password, row["password_hash"] if row else None):
            raise HTTPException(401, "Username or password is incorrect.")
        with connect(engine, write=True) as db:
            return session(db, data.username)

    def request_token(request, *, web=False):
        header = request.headers.get("Authorization", "")
        if not web and header.startswith("Bearer "):
            return header.removeprefix("Bearer ")
        return request.cookies.get("swarm_session", "")

    def active_session(token):
        if not token.startswith("swarm_") or len(token) != 49:
            return None
        with connect(engine) as db:
            row = db.execute("""
                SELECT handle FROM sessions WHERE token_hash = ? AND (expires_at IS NULL OR expires_at > ?)
            """, (token_hash(token), int(clock()))).fetchone()
        return row["handle"] if row else None

    def viewer(request, *, web=False):
        return active_session(request_token(request, web=web))

    def set_session(request, response, identity):
        response.headers["Cache-Control"] = "no-store"
        response.set_cookie("swarm_session", identity["token"], httponly=True, samesite="strict",
                            secure=request.url.scheme == "https")

    def logout(request, response, *, web=False):
        token = request_token(request, web=web)
        if token.startswith("swarm_"):
            with connect(engine, write=True) as db:
                db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))
        response.delete_cookie("swarm_session")

    def contributor(request, *, web=False):
        handle = viewer(request, web=web)
        if handle is None:
            raise HTTPException(401, "Sign in with a Swarm contributor token.")
        return handle

    def progress(db, goal_id):
        counts = dict.fromkeys(("open", "claimed", "submitted", "done"), 0)
        for row in db.execute("SELECT status, COUNT(*) AS count FROM tasks WHERE goal_id = ? GROUP BY status", (goal_id,)):
            counts[row["status"]] = row["count"]
        total = sum(counts.values())
        return {"total": total, **counts, "percent_done": counts["done"] * 100 // total if total else 0}

    def goals():
        with connect(engine, write=True) as db:
            expire(db)
            items = [dict(row) for row in db.execute("""
                SELECT g.*, (SELECT COUNT(*) FROM goal_votes WHERE goal_id = g.id) AS votes,
                    (SELECT COUNT(*) FROM tasks WHERE goal_id = g.id) AS task_count
                FROM goals g ORDER BY votes DESC, g.id
            """)]
            for item in items:
                item["progress"] = progress(db, item["id"])
            return items

    def goal(goal_id):
        with connect(engine, write=True) as db:
            expire(db)
            item = require_row(db.execute("""
                SELECT g.*, (SELECT COUNT(*) FROM goal_votes WHERE goal_id = g.id) AS votes,
                    (SELECT COUNT(*) FROM tasks WHERE goal_id = g.id) AS task_count
                FROM goals g WHERE id = ?
            """, (goal_id,)).fetchone(), "Goal")
            item["progress"] = progress(db, goal_id)
            return item

    def featured():
        items = goals()
        return next((item for item in items if item["progress"]["percent_done"] < 100), items[0] if items else None)

    task_query = """
        SELECT t.*, g.repo_url, g.title AS goal_title,
            (SELECT COUNT(*) FROM task_votes WHERE task_id = t.id) AS votes
        FROM tasks t JOIN goals g ON g.id = t.goal_id
    """

    def expire(db):
        db.execute("""
            UPDATE tasks SET status = 'open', claimant = NULL, lease_until = NULL, last_heartbeat = NULL
            WHERE status = 'claimed' AND lease_until <= ?
        """, (int(clock()),))

    def tasks(goal_id=None, available=False):
        with connect(engine, write=True) as db:
            expire(db)
            conditions, params = ["1 = 1"], ()
            if goal_id is not None:
                conditions.append("t.goal_id = ?")
                params = (goal_id,)
            if available:
                conditions.append("t.status = 'open'")
            query = task_query + " WHERE " + " AND ".join(conditions) + " ORDER BY votes DESC, t.id"
            return [dict(row) for row in db.execute(query, params)]

    def task(task_id):
        with connect(engine, write=True) as db:
            expire(db)
            return require_row(db.execute(task_query + " WHERE t.id = ?", (task_id,)).fetchone(), "Task")

    def add_goal(data, handle):
        url = repo_url(data.repo_url)
        with connect(engine, write=True) as db:
            goal_id = db.execute(
                "INSERT INTO goals (title, description, repo_url, author) VALUES (?, ?, ?, ?) RETURNING id",
                (data.title, data.description, url, handle),
            ).fetchone()["id"]
            log(db, "goal_proposed", f"Proposed goal: {data.title}", handle, goal_id)
        return goal(goal_id)

    def insert_task(db, goal_id, data, handle, parent_id=None):
        return db.execute("""
            INSERT INTO tasks (goal_id, parent_id, title, description, criteria, author)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING id
        """, (goal_id, parent_id, data.title, data.description, data.criteria, handle)).fetchone()["id"]

    def add_task(goal_id, data, handle):
        goal(goal_id)
        with connect(engine, write=True) as db:
            task_id = insert_task(db, goal_id, data, handle)
            log(db, "task_proposed", f"Proposed task: {data.title}", handle, goal_id, task_id)
        return task(task_id)

    def vote(kind, item_id, handle):
        if kind == "goals":
            goal(item_id)
            statement = "INSERT INTO goal_votes VALUES (?, ?) ON CONFLICT DO NOTHING"
            get_item = goal
        elif kind == "tasks":
            task(item_id)
            statement = "INSERT INTO task_votes VALUES (?, ?) ON CONFLICT DO NOTHING"
            get_item = task
        elif kind == "threads":
            thread(item_id)
            statement = "INSERT INTO thread_votes VALUES (?, ?) ON CONFLICT DO NOTHING"
            get_item = thread
        elif kind == "comments":
            comment(item_id)
            statement = "INSERT INTO comment_votes VALUES (?, ?) ON CONFLICT DO NOTHING"
            get_item = comment
        else:
            raise HTTPException(404, "Unknown vote target.")
        with connect(engine, write=True) as db:
            db.execute(statement, (item_id, handle))
        return get_item(item_id)

    def claim(task_id, handle):
        with connect(engine, write=True) as db:
            expire(db)
            item = require_row(db.execute(task_query + " WHERE t.id = ?", (task_id,)).fetchone(), "Task")
            if item["status"] == "claimed" and item["claimant"] == handle:
                return item
            if item["status"] != "open":
                raise HTTPException(409, "Task is not available.")
            updated = db.execute("""
                UPDATE tasks SET status = 'claimed', claimant = ?, lease_until = ?
                WHERE id = ? AND status = 'open'
            """, (handle, int(clock()) + lease_seconds, task_id))
            if not updated.rowcount:
                raise HTTPException(409, "Task is not available.")
            log(db, "claimed", "Claimed a task.", handle, item["goal_id"], task_id)
        return task(task_id)

    def heartbeat(task_id, handle):
        now = int(clock())
        with connect(engine, write=True) as db:
            updated = db.execute("""
                UPDATE tasks SET lease_until = ?, last_heartbeat = ?
                WHERE id = ? AND status = 'claimed' AND claimant = ? AND lease_until > ?
            """, (now + lease_seconds, now, task_id, handle, now))
            if not updated.rowcount:
                raise HTTPException(409, "Only the active claimant can heartbeat.")
        return task(task_id)

    def submit(task_id, data, handle):
        with connect(engine, write=True) as db:
            expire(db)
            item = require_row(db.execute(task_query + " WHERE t.id = ?", (task_id,)).fetchone(), "Task")
            if item["status"] != "claimed" or item["claimant"] != handle:
                raise HTTPException(409, "Only the active claimant can submit a result.")
            if not re.fullmatch(re.escape(item["repo_url"]) + r"/pull/[1-9][0-9]*", data.pr_url, re.IGNORECASE):
                raise HTTPException(422, "Use a GitHub pull request URL on the goal repository.")
            updated = db.execute("""
                UPDATE tasks SET status = 'submitted', lease_until = NULL, last_heartbeat = NULL, pr_url = ?, summary = ?
                WHERE id = ? AND status = 'claimed' AND claimant = ? AND lease_until > ?
            """, (data.pr_url, data.summary, task_id, handle, int(clock())))
            if not updated.rowcount:
                raise HTTPException(409, "Only the active claimant can submit a result.")
            log(db, "submitted", "Submitted a pull request.", handle, item["goal_id"], task_id)
        return task(task_id)

    def done(task_id, handle):
        with connect(engine, write=True) as db:
            item = require_row(db.execute("""
                SELECT t.status, t.author, t.goal_id, g.author AS goal_author
                FROM tasks t JOIN goals g ON g.id = t.goal_id WHERE t.id = ?
            """, (task_id,)).fetchone(), "Task")
            if handle not in {item["author"], item["goal_author"]}:
                raise HTTPException(403, "Only the goal or task proposer can mark a result done.")
            if item["status"] != "submitted":
                raise HTTPException(409, "A result must be submitted first.")
            updated = db.execute("UPDATE tasks SET status = 'done' WHERE id = ? AND status = 'submitted'", (task_id,))
            if not updated.rowcount:
                raise HTTPException(409, "A result must be submitted first.")
            log(db, "done", "Marked a result done.", handle, item["goal_id"], task_id)
        return task(task_id)

    def notes(goal_id):
        goal(goal_id)
        with connect(engine) as db:
            return [dict(row) for row in db.execute(
                "SELECT * FROM notes WHERE goal_id = ? ORDER BY id DESC LIMIT 100", (goal_id,)
            )]

    def post_note(goal_id, data, handle):
        goal(goal_id)
        with connect(engine, write=True) as db:
            note_id = db.execute(
                "INSERT INTO notes (goal_id, author, body, created_at) VALUES (?, ?, ?, ?) RETURNING id",
                (goal_id, handle, data.body, int(clock())),
            ).fetchone()["id"]
            return dict(db.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone())

    def subtasks(parent_id, data, handle):
        parent = task(parent_id)
        with connect(engine, write=True) as db:
            ids = [insert_task(db, parent["goal_id"], item, handle, parent_id) for item in data.tasks]
        return [task(task_id) for task_id in ids]

    def leaders():
        with connect(engine) as db:
            return [dict(row) for row in db.execute("""
                SELECT claimant AS handle, COUNT(*) AS contributions,
                    SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
                FROM tasks WHERE status IN ('submitted', 'done')
                GROUP BY claimant ORDER BY contributions DESC, done DESC, handle
            """)]

    def stats():
        now = int(clock())
        with connect(engine) as db:
            return dict(db.execute("""
                SELECT
                (SELECT COUNT(*) FROM tasks WHERE status = 'claimed' AND lease_until > ?
                    AND last_heartbeat > ?) AS agents_running,
                (SELECT COUNT(*) FROM contributors) AS contributors,
                (SELECT COUNT(*) FROM tasks WHERE status = 'done' AND pr_url IS NOT NULL) AS prs_merged
            """, (now, now - 90)).fetchone())

    def log(db, kind, summary, actor, goal_id=None, task_id=None):
        return dict(db.execute("""
            INSERT INTO events (goal_id, task_id, actor, kind, summary, created_at)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING *
        """, (goal_id, task_id, actor, kind, summary, int(clock()))).fetchone())

    def activity(limit=20, goal_id=None, after=None):
        conditions, params = ["1 = 1"], ()
        if goal_id is not None:
            conditions.append("goal_id = ?")
            params += (goal_id,)
        if after is not None:
            conditions.append("id > ?")
            params += (after,)
        order = "DESC" if after is None else "ASC"
        query = "SELECT * FROM events WHERE " + " AND ".join(conditions) + f" ORDER BY id {order} LIMIT ?"
        with connect(engine) as db:
            return [dict(row) for row in db.execute(query, (*params, limit))]

    def run_event(task_id, data, handle):
        with connect(engine, write=True) as db:
            now = int(clock())
            if data.kind in {"finished", "failed"}:
                update = "last_heartbeat = NULL"
                params = ()
            elif data.kind == "started":
                update = "last_heartbeat = ?"
                params = (now,)
            else:
                update = "last_heartbeat = last_heartbeat"
                params = ()
            row = db.execute(f"""
                UPDATE tasks SET {update} WHERE id = ? AND status = 'claimed'
                    AND claimant = ? AND lease_until > ? RETURNING goal_id
            """, (*params, task_id, handle, now)).fetchone()
            if row is None:
                raise HTTPException(409, "Only the active claimant can post run events.")
            return log(db, data.kind, data.summary, handle, row["goal_id"], task_id)

    thread_query = """
        SELECT t.*, (SELECT COUNT(*) FROM thread_votes WHERE thread_id = t.id) AS votes,
            (SELECT COUNT(*) FROM comments WHERE thread_id = t.id) AS comment_count
        FROM threads t
    """
    comment_query = """
        SELECT c.*, (SELECT COUNT(*) FROM comment_votes WHERE comment_id = c.id) AS votes FROM comments c
    """

    def threads(goal_id=None, general=False):
        query = thread_query
        params = ()
        if goal_id is not None:
            query += " WHERE t.goal_id = ?"
            params = (goal_id,)
        elif general:
            query += " WHERE t.goal_id IS NULL"
        with connect(engine) as db:
            return [dict(row) for row in db.execute(query + " ORDER BY t.id DESC LIMIT 100", params)]

    def thread(thread_id):
        with connect(engine) as db:
            item = require_row(db.execute(thread_query + " WHERE t.id = ?", (thread_id,)).fetchone(), "Thread")
            item["comments"] = [dict(row) for row in db.execute(
                comment_query + " WHERE c.thread_id = ? ORDER BY c.id", (thread_id,),
            )]
            return item

    def comment(comment_id):
        with connect(engine) as db:
            return require_row(db.execute(comment_query + " WHERE c.id = ?", (comment_id,)).fetchone(), "Comment")

    def add_thread(data, handle):
        if data.goal_id is not None:
            goal(data.goal_id)
        with connect(engine, write=True) as db:
            thread_id = db.execute("""
                INSERT INTO threads (goal_id, author, title, body, created_at)
                VALUES (?, ?, ?, ?, ?) RETURNING id
            """, (data.goal_id, handle, data.title, data.body, int(clock()))).fetchone()["id"]
            log(db, "thread", f"Started a discussion: {data.title}", handle, data.goal_id)
        return thread(thread_id)

    def add_comment(thread_id, data, handle):
        target = thread(thread_id)
        with connect(engine, write=True) as db:
            comment_id = db.execute("""
                INSERT INTO comments (thread_id, author, body, created_at) VALUES (?, ?, ?, ?) RETURNING id
            """, (thread_id, handle, data.body, int(clock()))).fetchone()["id"]
            log(db, "comment", "Commented on a discussion.", handle, target["goal_id"])
        return comment(comment_id)

    @api.post("/auth/register", status_code=201)
    def api_register(data: AccountInput, request: Request, response: Response):
        identity = signup(data.username, data.password)
        set_session(request, response, identity)
        return identity

    @api.post("/auth/login")
    def api_login(data: AccountInput, request: Request, response: Response):
        identity = authenticate(data)
        set_session(request, response, identity)
        return identity

    @api.post("/auth/logout")
    def api_logout(request: Request, response: Response):
        logout(request, response)
        return {"ok": True}

    @api.get("/auth/github")
    def api_github():
        if not (os.environ.get("GITHUB_OAUTH_CLIENT_ID") and os.environ.get("GITHUB_OAUTH_CLIENT_SECRET")):
            raise HTTPException(404, "GitHub OAuth is not configured.")
        raise HTTPException(501, "GitHub OAuth is planned but not implemented.")

    @api.post("/contributors", status_code=201)
    def api_signup(data: Signup):
        return signup(data.handle)

    @api.get("/me")
    def api_me(request: Request):
        return {"handle": contributor(request)}

    @api.get("/goals")
    def api_goals():
        return goals()

    @api.post("/goals", status_code=201)
    def api_add_goal(data: GoalInput, request: Request):
        return add_goal(data, contributor(request))

    @api.get("/goals/featured")
    def api_featured():
        return featured()

    @api.get("/goals/{goal_id}")
    def api_goal(goal_id: int):
        return goal(goal_id)

    @api.get("/goals/{goal_id}/progress")
    def api_progress(goal_id: int):
        return goal(goal_id)["progress"]

    @api.post("/goals/{goal_id}/tasks", status_code=201)
    def api_add_task(goal_id: int, data: TaskInput, request: Request):
        return add_task(goal_id, data, contributor(request))

    @api.get("/tasks")
    def api_tasks(goal_id: int | None = None, available: bool = False):
        if goal_id is not None:
            goal(goal_id)
        return tasks(goal_id, available)

    @api.get("/tasks/{task_id}")
    def api_task(task_id: int):
        return task(task_id)

    @api.post("/{kind}/{item_id}/vote")
    def api_vote(kind: Literal["goals", "tasks", "threads", "comments"], item_id: int, request: Request):
        return vote(kind, item_id, contributor(request))

    @api.post("/tasks/{task_id}/claim")
    def api_claim(task_id: int, request: Request):
        return claim(task_id, contributor(request))

    @api.post("/tasks/{task_id}/heartbeat")
    def api_heartbeat(task_id: int, request: Request):
        return heartbeat(task_id, contributor(request))

    @api.post("/tasks/{task_id}/events", status_code=201)
    def api_run_event(task_id: int, data: EventInput, request: Request):
        return run_event(task_id, data, contributor(request))

    @api.post("/tasks/{task_id}/submit")
    def api_submit(task_id: int, data: Submission, request: Request):
        return submit(task_id, data, contributor(request))

    @api.post("/tasks/{task_id}/done")
    def api_done(task_id: int, request: Request):
        return done(task_id, contributor(request))

    @api.get("/goals/{goal_id}/notes")
    def api_notes(goal_id: int):
        return notes(goal_id)

    @api.post("/goals/{goal_id}/notes", status_code=201)
    def api_note(goal_id: int, data: NoteInput, request: Request):
        return post_note(goal_id, data, contributor(request))

    @api.post("/tasks/{task_id}/subtasks", status_code=201)
    def api_subtasks(task_id: int, data: SubtasksInput, request: Request):
        return subtasks(task_id, data, contributor(request))

    @api.get("/leaderboard")
    def api_leaders():
        return leaders()

    @api.get("/stats")
    def api_stats():
        return stats()

    @api.get("/activity")
    def api_activity(limit: int = 20):
        return activity(max(1, min(limit, 100)))

    @api.get("/events/stream", response_class=StreamingResponse)
    async def api_stream(request: Request, goal_id: int | None = None, after: int = 0):
        try:
            cursor = max(0, after, int(request.headers.get("Last-Event-ID", "0")))
        except ValueError:
            raise HTTPException(400, "Invalid Last-Event-ID.") from None

        async def stream():
            nonlocal cursor
            while not await request.is_disconnected():
                items = await run_in_threadpool(activity, 100, goal_id, cursor)
                for item in items:
                    cursor = item["id"]
                    yield f"id: {cursor}\ndata: {json.dumps(item)}\n\n"
                if not items:
                    yield ": keepalive\n\n"
                    await asyncio.sleep(2)

        return StreamingResponse(stream(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @api.get("/threads")
    def api_threads(goal_id: int | None = None, general: bool = False):
        return threads(goal_id, general)

    @api.post("/threads", status_code=201)
    def api_add_thread(data: ThreadInput, request: Request):
        return add_thread(data, contributor(request))

    @api.get("/threads/{thread_id}")
    def api_thread(thread_id: int):
        return thread(thread_id)

    @api.post("/threads/{thread_id}/comments", status_code=201)
    def api_comment(thread_id: int, data: NoteInput, request: Request):
        return add_comment(thread_id, data, contributor(request))

    app.include_router(api)

    def page(request, template, *, status_code=200, **context):
        return templates.TemplateResponse(
            request=request, name=template, context={"viewer": viewer(request, web=True), **context},
            status_code=status_code,
        )

    @app.get("/")
    def home(request: Request):
        items = goals()
        current = next((item for item in items if item["progress"]["percent_done"] < 100), items[0] if items else None)
        return page(request, "home.html", goals=items, featured=current, stats=stats(),
                    open_count=sum(item["progress"]["open"] for item in items))

    @app.get("/goals/{goal_id}")
    def goal_page(goal_id: int, request: Request):
        return page(request, "goal.html", goal=goal(goal_id), tasks=tasks(goal_id), notes=notes(goal_id),
                    threads=threads(goal_id))

    @app.get("/leaderboard")
    def leaderboard(request: Request):
        return page(request, "leaderboard.html", leaders=leaders())

    @app.get("/join")
    def join_page(request: Request):
        return page(request, "join.html")

    def redirect(url):
        return RedirectResponse(url, status_code=303)

    def web_origin(request):
        if request.headers.get("sec-fetch-site") == "cross-site":
            raise HTTPException(403, "Cross-site form submissions are not allowed.")

    @app.post("/join")
    async def join(request: Request):
        web_origin(request)
        form = await request.form()
        try:
            action = form.get("action")
            if action == "token":
                token = str(form.get("token", "")).strip()
                handle = active_session(token)
                if not handle:
                    raise HTTPException(401, "Swarm contributor token not recognized.")
                identity = {"handle": handle, "token": token}
            else:
                account = AccountInput.model_validate(dict(form))
                identity = await run_in_threadpool(authenticate, account) if action == "login" else (
                    await run_in_threadpool(signup, account.username, account.password)
                )
        except (HTTPException, ValidationError) as exc:
            error = exc.detail if isinstance(exc, HTTPException) else "Enter a valid handle and a 12–128 character password."
            return page(request, "join.html", status_code=400, error=error)
        response = redirect("/")
        set_session(request, response, identity)
        return response

    @app.post("/sign-out")
    def sign_out(request: Request):
        web_origin(request)
        response = redirect("/")
        logout(request, response, web=True)
        return response

    @app.get("/propose")
    def propose(request: Request, goal_id: int | None = None, parent_id: int | None = None):
        parent = task(parent_id) if parent_id is not None else None
        target = goal(parent["goal_id"] if parent else goal_id) if parent or goal_id is not None else None
        return page(request, "propose.html", goal=target, parent=parent)

    @app.post("/propose")
    async def propose_post(request: Request, goal_id: int | None = None, parent_id: int | None = None):
        web_origin(request)
        handle = contributor(request, web=True)
        parent = task(parent_id) if parent_id is not None else None
        target = goal(parent["goal_id"] if parent else goal_id) if parent or goal_id is not None else None
        form = dict(await request.form())
        try:
            if parent:
                item = subtasks(parent_id, SubtasksInput(tasks=[TaskInput.model_validate(form)]), handle)[0]
            elif target:
                item = add_task(goal_id, TaskInput.model_validate(form), handle)
            else:
                item = add_goal(GoalInput.model_validate(form), handle)
        except (HTTPException, ValidationError) as exc:
            error = exc.detail if isinstance(exc, HTTPException) else "Fill in all fields and keep within the displayed limits."
            return page(request, "propose.html", status_code=422, goal=target, parent=parent, values=form, error=error)
        if target:
            return redirect(f"/goals/{item['goal_id']}#task-{item['id']}")
        return redirect(f"/goals/{item['id']}")

    @app.post("/vote/{kind}/{item_id}")
    def web_vote(kind: str, item_id: int, request: Request):
        web_origin(request)
        item = vote(kind, item_id, contributor(request, web=True))
        if kind == "threads":
            return redirect(f"/forum/{item_id}")
        if kind == "comments":
            return redirect(f"/forum/{item['thread_id']}#comment-{item_id}")
        if kind == "tasks":
            return redirect(f"/goals/{item['goal_id']}#task-{item_id}")
        return redirect(f"/goals/{item_id}")

    @app.post("/goals/{goal_id}/notes")
    async def web_note(goal_id: int, request: Request):
        web_origin(request)
        handle = contributor(request, web=True)
        try:
            post_note(goal_id, NoteInput.model_validate(dict(await request.form())), handle)
        except ValidationError:
            raise HTTPException(422, "Notes must be 1–5000 characters.") from None
        return redirect(f"/goals/{goal_id}#scratchpad")

    @app.post("/tasks/{task_id}/done")
    def web_done(task_id: int, request: Request):
        web_origin(request)
        item = done(task_id, contributor(request, web=True))
        return redirect(f"/goals/{item['goal_id']}#task-{task_id}")

    @app.get("/forum")
    def forum(request: Request, goal_id: int | None = None):
        target = goal(goal_id) if goal_id is not None else None
        return page(request, "forum.html", threads=threads(goal_id, general=goal_id is None), goal=target)

    @app.post("/forum")
    async def web_thread(request: Request, goal_id: int | None = None):
        web_origin(request)
        handle = contributor(request, web=True)
        form = dict(await request.form())
        try:
            item = add_thread(ThreadInput.model_validate({**form, "goal_id": goal_id}), handle)
        except ValidationError:
            raise HTTPException(422, "Enter a title and discussion text.") from None
        return redirect(f"/forum/{item['id']}")

    @app.get("/forum/{thread_id}")
    def thread_page(thread_id: int, request: Request):
        return page(request, "thread.html", thread=thread(thread_id))

    @app.post("/forum/{thread_id}/comments")
    async def web_comment(thread_id: int, request: Request):
        web_origin(request)
        handle = contributor(request, web=True)
        try:
            item = add_comment(thread_id, NoteInput.model_validate(dict(await request.form())), handle)
        except ValidationError:
            raise HTTPException(422, "Comments must be 1–5000 characters.") from None
        return redirect(f"/forum/{thread_id}#comment-{item['id']}")

    @app.get("/watch")
    def watch(request: Request, goal_id: int | None = None):
        target = goal(goal_id) if goal_id is not None else None
        items = activity(goal_id=goal_id)
        return page(request, "watch.html", goal=target, activity=items, cursor=items[0]["id"] if items else 0,
                    stats=stats())

    return app


app = create_app()
