import asyncio
import json
import os
import re
import secrets
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from ipaddress import ip_address
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from fastapi.security import HTTPBearer
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError
from sqlalchemy.exc import IntegrityError

from .accounts import password_hash, token_hash, verify_password
from .moderation import (
    KINDS, RESERVED, Kind, LimitWriteBody, ModerationInput, ReportInput, RoleInput, admin_handles, check_github_pr,
)
from .orchestration import (
    READY_FILTER, Handoff, PathCheckInput, PathLeaseInput, ReviewInput,
    check_paths, lease_path, register_dependencies,
)
from .store import connect, database, initialize, migrate


ROOT = Path(__file__).parent
REPLIES_PER_PAGE = 100
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


class ProgressResponse(BaseModel):
    total: int
    open: int
    claimed: int
    submitted: int
    done: int
    percent_done: int


class GoalResponse(GoalInput):
    id: int
    author: str
    votes: int
    task_count: int
    visibility: str
    created_at: int
    status: Literal["open", "done"]
    progress: ProgressResponse
    viewer_voted: bool = False


class VotableResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    votes: int
    viewer_voted: bool


class ThreadDetailResponse(VotableResponse):
    comments: list[VotableResponse]
    comments_page: int
    comments_next_page: int | None


class TaskInput(BaseModel):
    title: Title
    description: Body
    criteria: Body
    depends_on: list[int] = Field(default_factory=list, max_length=20)


class SubtasksInput(BaseModel):
    tasks: list[TaskInput] = Field(min_length=1, max_length=10)


class NoteInput(BaseModel):
    body: Body


class Submission(BaseModel):
    pr_url: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]
    summary: Body
    handoff: Handoff | None = None


class ThreadInput(BaseModel):
    goal_id: int | None = None
    title: Title
    body: Body


class EventInput(BaseModel):
    kind: Literal["started", "progress", "finished", "failed"]
    summary: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=280)]
    run_id: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{32}$")] | None = None


class EventResponse(BaseModel):
    id: int
    goal_id: int | None
    task_id: int | None
    actor: str
    kind: str
    summary: str
    created_at: int
    run_id: str | None


def repo_url(value):
    normalized = value.rstrip("/").removesuffix(".git")
    if not REPO.fullmatch(normalized) or normalized.rsplit("/", 1)[1] in {".", ".."}:
        raise HTTPException(422, "Use a public repository URL such as https://github.com/org/repo.")
    return normalized


def require_row(row, kind):
    if row is None:
        raise HTTPException(404, f"{kind} not found.")
    return dict(row)


def create_app(db_path=None, *, seed=None, clock=time.time, lease_seconds=3600, database_url=None, review_quorum=None,
               vote_age=None, claim_cap=2, pr_checker=None, write_limit=40, signup_limit=5):
    path = Path(db_path or os.environ.get("SWARM_DB", "swarm.sqlite3"))
    database_url = database_url or (os.environ.get("DATABASE_URL") if db_path is None else None)
    engine = database(path, database_url)
    seed = os.environ.get("SWARM_SEED", "1") != "0" if seed is None else seed
    review_quorum = max(1, int(os.environ.get("SWARM_REVIEW_QUORUM", "1"))) if review_quorum is None else review_quorum
    vote_age = int(os.environ.get("SWARM_VOTE_MIN_AGE_SECONDS", "600")) if vote_age is None else vote_age
    goal_quota = max(1, int(os.environ.get("SWARM_GOAL_DAILY_LIMIT", "3")))
    trust_railway_client_ip = os.environ.get("SWARM_TRUST_RAILWAY_CLIENT_IP") == "1"
    pr_checker = pr_checker or (check_github_pr if os.environ.get("SWARM_CHECK_GITHUB_PRS", "1") == "1" else
                                lambda *_: "unverified")

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
    app.add_middleware(LimitWriteBody)
    bearer_scheme = HTTPBearer(auto_error=False, scheme_name="SwarmBearer")
    api = APIRouter(prefix="/api/v1")
    templates = Jinja2Templates(directory=ROOT / "templates")
    templates.env.filters["utc"] = lambda seconds: datetime.fromtimestamp(seconds, timezone.utc).isoformat(timespec="seconds")
    app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")

    def session(db, handle, *, permanent=False):
        token = "swarm_" + secrets.token_urlsafe(32)
        expires = None if permanent else int(clock()) + 30 * 24 * 3600
        db.execute("INSERT INTO sessions VALUES (?, ?, ?)", (token_hash(token), handle, expires))
        return {"handle": handle, "token": token}

    def signup(handle, password=None):
        if handle in RESERVED | admin_handles() or handle.startswith("demo"):
            raise HTTPException(409, "That handle is reserved.")
        hashed = password_hash(password) if password is not None else None
        try:
            with connect(engine, write=True) as db:
                db.execute("INSERT INTO contributors (handle, password_hash, created_at) VALUES (?, ?, ?)",
                           (handle, hashed, int(clock())))
                return session(db, handle, permanent=password is None)
        except IntegrityError:
            raise HTTPException(409, "That handle is already taken.") from None

    def authenticate(data):
        with connect(engine) as db:
            row = db.execute("SELECT password_hash, banned FROM contributors WHERE handle = ?", (data.username,)).fetchone()
        if not verify_password(data.password, row["password_hash"] if row else None) or row["banned"]:
            raise HTTPException(401, "Username or password is incorrect.")
        with connect(engine, write=True) as db:
            return session(db, data.username)

    def bearer_token(request):
        parts = request.headers.get("Authorization", "").split(maxsplit=1)
        if parts and parts[0].lower() == "bearer":
            return parts[1].strip() if len(parts) == 2 else ""
        return None

    def request_token(request, *, web=False):
        bearer = None if web else bearer_token(request)
        if bearer is not None:
            return bearer
        return request.cookies.get("swarm_session", "")

    def active_session(token):
        if not token.startswith("swarm_") or len(token) != 49:
            return None
        with connect(engine) as db:
            row = db.execute("""
                SELECT s.handle FROM sessions s JOIN contributors c ON c.handle = s.handle
                WHERE s.token_hash = ? AND c.banned = 0 AND (s.expires_at IS NULL OR s.expires_at > ?)
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

    def contributor(request, *, web=False, optional=False):
        handle = viewer(request, web=web)
        if handle is None and (not optional or (not web and bearer_token(request) is not None)):
            raise HTTPException(401, "Sign in to Swarm Commons again; your session may have expired.",
                                headers=None if web else {"WWW-Authenticate": "Bearer"})
        return handle

    def authenticate_request(request: Request, _=Depends(bearer_scheme)):
        if request.method != "GET" and bearer_token(request) is None:
            web_origin(request, allow_cors_origin=True)
        return contributor(request)

    auth = Depends(authenticate_request)

    def optional_viewer(request: Request, response: Response):
        response.headers["Cache-Control"] = "private, no-store"
        return contributor(request, optional=True)

    read_viewer = Depends(optional_viewer)

    def role_in(db, handle):
        if not handle:
            return "contributor"
        row = db.execute("SELECT role FROM contributors WHERE handle = ? AND banned = 0", (handle,)).fetchone()
        return row["role"] if row else "contributor"

    def role(handle):
        with connect(engine) as db:
            return role_in(db, handle)

    def moderator(handle):
        return role(handle) in {"admin", "moderator"}

    def count_write(ip, handle, signup_attempt):
        minute = int(clock()) // 60
        key = f"signup:{ip}" if signup_attempt else f"write:{handle or ip}"
        with connect(engine, write=True) as db:
            db.execute("DELETE FROM rate_buckets WHERE minute < ?", (minute - 10,))
            count = db.execute("""
                INSERT INTO rate_buckets VALUES (?, ?, 1)
                ON CONFLICT (key, minute) DO UPDATE SET hits = rate_buckets.hits + 1 RETURNING hits
            """, (key, minute)).fetchone()["hits"]
        return count <= (signup_limit if signup_attempt else write_limit)

    def rate_limit_ip(request):
        if trust_railway_client_ip:
            forwarded = request.headers.get("X-Real-IP")
            if forwarded:
                try:
                    return str(ip_address(forwarded))
                except ValueError:
                    pass
        return request.client.host if request.client else "unknown"

    @app.middleware("http")
    async def rate_limit(request, call_next):
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            path = request.url.path
            ip = rate_limit_ip(request)
            signup_attempt = path in {"/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/contributors", "/join"}
            handle = None if signup_attempt else await run_in_threadpool(viewer, request)
            if not await run_in_threadpool(count_write, ip, handle, signup_attempt):
                return JSONResponse({"detail": "Too many writes. Try again in a minute."}, status_code=429, headers={"Retry-After": "60"})
        return await call_next(request)

    origins = [item.strip() for item in os.environ.get("SWARM_CORS_ORIGINS", "*").split(",") if item.strip()]
    cors_credentials = bool(origins and "*" not in origins)
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST", "DELETE"],
                       allow_headers=["Authorization", "Content-Type", "Last-Event-ID"],
                       allow_credentials=cors_credentials)

    def progress(db, goal_id):
        counts = dict.fromkeys(("open", "claimed", "submitted", "done"), 0)
        for row in db.execute("""
            SELECT status, COUNT(*) AS count FROM tasks WHERE goal_id = ? AND visibility = 'approved' GROUP BY status
        """, (goal_id,)):
            counts[row["status"]] = row["count"]
        total = sum(counts.values())
        return {"total": total, **counts, "percent_done": counts["done"] * 100 // total if total else 0}

    def with_progress(db, item):
        item["progress"] = progress(db, item["id"])
        item["status"] = "done" if item["progress"]["percent_done"] == 100 else "open"
        return item

    def goals():
        with connect(engine, write=True) as db:
            expire(db)
            items = [dict(row) for row in db.execute("""
                SELECT g.*, (SELECT COUNT(*) FROM goal_votes WHERE goal_id = g.id) AS votes,
                    (SELECT COUNT(*) FROM tasks WHERE goal_id = g.id AND visibility = 'approved') AS task_count
                FROM goals g WHERE g.visibility = 'approved' ORDER BY votes DESC, g.id
            """)]
            return [with_progress(db, item) for item in items]

    def goal(goal_id, handle=None, *, any_visibility=False):
        with connect(engine, write=True) as db:
            expire(db)
            item = require_row(db.execute("""
                SELECT g.*, (SELECT COUNT(*) FROM goal_votes WHERE goal_id = g.id) AS votes,
                    (SELECT COUNT(*) FROM tasks WHERE goal_id = g.id AND visibility = 'approved') AS task_count
                FROM goals g WHERE id = ?
            """, (goal_id,)).fetchone(), "Goal")
            if item["visibility"] != "approved" and not any_visibility and not (handle and (
                item["author"] == handle or role_in(db, handle) in {"admin", "moderator"}
            )):
                raise HTTPException(404, "Goal not found.")
            return with_progress(db, item)

    def featured():
        items = goals()
        return next((item for item in items if item["progress"]["percent_done"] < 100), items[0] if items else None)

    task_query = f"""
        SELECT t.*, g.repo_url, g.title AS goal_title, g.author AS goal_author, g.visibility AS goal_visibility,
            (SELECT COUNT(*) FROM task_votes WHERE task_id = t.id) AS votes,
            ({READY_FILTER}) AS ready
        FROM tasks t JOIN goals g ON g.id = t.goal_id
    """

    def submission_id(db, task_id):
        return db.execute("""
            SELECT MAX(id) AS id FROM events WHERE task_id = ? AND kind = 'submitted'
        """, (task_id,)).fetchone()["id"]

    def task_details(db, item, *, review=False):
        item["ready"] = bool(item["ready"])
        item["depends_on"] = [row["dependency_id"] for row in db.execute("""
            SELECT dependency_id FROM task_dependencies WHERE task_id = ? ORDER BY dependency_id
        """, (item["id"],))]
        if review:
            item["submission_id"] = submission_id(db, item["id"]) if item["pr_url"] else None
            row = db.execute("SELECT data FROM handoffs WHERE task_id = ?", (item["id"],)).fetchone()
            item["handoff"] = json.loads(row["data"]) if row else None
            item["reviews"] = [
                {**result, "approved": bool(result["approved"])}
                for result in db.execute("""
                    SELECT reviewer, approved, summary, created_at FROM reviews WHERE task_id = ? ORDER BY created_at, reviewer
                """, (item["id"],))
            ]
            item["review_quorum"] = review_quorum
        return item

    def expire(db):
        db.execute("""
            UPDATE tasks SET status = 'open', claimant = NULL, lease_until = NULL, last_heartbeat = NULL, claimed_at = NULL
            WHERE status = 'claimed' AND lease_until <= ?
        """, (int(clock()),))

    def tasks(goal_id=None, available=False, handle=None):
        with connect(engine, write=True) as db:
            expire(db)
            conditions, params = ["g.visibility = 'approved'", "t.visibility = 'approved'"], ()
            if handle and goal_id is not None:
                if role_in(db, handle) in {"admin", "moderator"}:
                    conditions = ["t.visibility IN ('approved', 'pending')"]
                else:
                    conditions = [
                        "(g.visibility = 'approved' OR g.author = ?)",
                        "(t.visibility = 'approved' OR (t.visibility = 'pending' AND (t.author = ? OR g.author = ?)))",
                    ]
                    params = (handle, handle, handle)
            if goal_id is not None:
                conditions.append("t.goal_id = ?")
                params += (goal_id,)
            if available:
                conditions.extend(("t.status = 'open'", "g.visibility = 'approved'", "t.visibility = 'approved'", READY_FILTER))
            query = task_query + " WHERE " + " AND ".join(conditions) + " ORDER BY votes DESC, t.id"
            rows = [dict(row) for row in db.execute(query, params)]
            return [task_details(db, row, review=True) for row in rows]

    def task(task_id, handle=None, *, any_visibility=False):
        with connect(engine, write=True) as db:
            expire(db)
            item = require_row(db.execute(task_query + " WHERE t.id = ?", (task_id,)).fetchone(), "Task")
            if (item["visibility"] != "approved" or item["goal_visibility"] != "approved") and not any_visibility:
                if not handle or not (
                    handle in {item["author"], item["goal_author"]} or role_in(db, handle) in {"admin", "moderator"}
                ):
                    raise HTTPException(404, "Task not found.")
            return task_details(db, item, review=True)

    def add_goal(data, handle):
        url = repo_url(data.repo_url)
        with connect(engine, write=True) as db:
            suffix = " FOR UPDATE" if db.connection.dialect.name == "postgresql" else ""
            db.execute("SELECT handle FROM contributors WHERE handle = ?" + suffix, (handle,)).fetchone()
            now = int(clock())
            recent = db.execute("SELECT COUNT(*) AS total FROM goals WHERE author = ? AND created_at > ?",
                                (handle, now - 86400)).fetchone()["total"]
            if recent >= goal_quota:
                raise HTTPException(429, "Daily goal proposal limit reached.")
            goal_id = db.execute(
                "INSERT INTO goals (title, description, repo_url, author, visibility, created_at) VALUES (?, ?, ?, ?, 'pending', ?) RETURNING id",
                (data.title, data.description, url, handle, now),
            ).fetchone()["id"]
            log(db, "goal_proposed", "Proposed a goal.", handle, goal_id)
        return goal(goal_id, any_visibility=True)

    def insert_task(db, goal_id, data, handle, parent_id=None):
        task_id = db.execute("""
            INSERT INTO tasks (goal_id, parent_id, title, description, criteria, author, visibility)
            VALUES (?, ?, ?, ?, ?, ?, 'pending') RETURNING id
        """, (goal_id, parent_id, data.title, data.description, data.criteria, handle)).fetchone()["id"]
        register_dependencies(db, goal_id, task_id, data.depends_on)
        return task_id

    def add_task(goal_id, data, handle):
        goal(goal_id, handle)
        with connect(engine, write=True) as db:
            task_id = insert_task(db, goal_id, data, handle)
            log(db, "task_proposed", "Proposed a task.", handle, goal_id, task_id)
        return task(task_id, any_visibility=True)

    def vote_state(handle, *kinds):
        if not handle:
            return {kind: set() for kind in kinds}
        with connect(engine) as db:
            return {kind: {row["id"] for row in db.execute(
                f"SELECT {kind[:-1]}_id AS id FROM {kind[:-1]}_votes WHERE handle = ?", (handle,),
            )} for kind in kinds}

    def with_viewer_vote(item, voted):
        return {**item, "viewer_voted": item["id"] in voted}

    def vote(kind, item_id, handle, *, remove=False):
        if kind == "goals":
            goal(item_id)
            column, table = "goal_id", "goal_votes"
            get_item = goal
        elif kind == "tasks":
            task(item_id)
            column, table = "task_id", "task_votes"
            get_item = task
        elif kind == "threads":
            thread(item_id)
            column, table = "thread_id", "thread_votes"
            get_item = thread
        elif kind == "comments":
            comment(item_id)
            column, table = "comment_id", "comment_votes"
            get_item = comment
        else:
            raise HTTPException(404, "Unknown vote target.")
        with connect(engine, write=True) as db:
            if remove:
                db.execute(f"DELETE FROM {table} WHERE {column} = ? AND handle = ?", (item_id, handle))
            else:
                account = db.execute("""
                    SELECT password_hash, role, created_at FROM contributors WHERE handle = ?
                """, (handle,)).fetchone()
                if not account["password_hash"] or (
                    int(clock()) - account["created_at"] < vote_age and account["role"] == "contributor"
                ):
                    raise HTTPException(403, "Voting requires a password account past its new-account waiting period.")
                db.execute(f"INSERT INTO {table} VALUES (?, ?) ON CONFLICT DO NOTHING", (item_id, handle))
        item = get_item(item_id)
        item["viewer_voted"] = not remove
        if kind == "threads":
            voted_comments = vote_state(handle, "comments")["comments"]
            item["comments"] = [with_viewer_vote(comment, voted_comments) for comment in item["comments"]]
        return item

    def claim(task_id, handle):
        with connect(engine, write=True) as db:
            suffix = " FOR UPDATE" if db.connection.dialect.name == "postgresql" else ""
            db.execute("SELECT handle FROM contributors WHERE handle = ?" + suffix, (handle,)).fetchone()
            expire(db)
            item = require_row(db.execute(task_query + " WHERE t.id = ?", (task_id,)).fetchone(), "Task")
            if item["visibility"] != "approved" or item["goal_visibility"] != "approved":
                raise HTTPException(409, "Task is not approved for work.")
            if item["status"] == "claimed" and item["claimant"] == handle:
                return task_details(db, item, review=True)
            if item["status"] != "open" or not item["ready"]:
                raise HTTPException(409, "Task is not available.")
            active = db.execute("""
                SELECT COUNT(*) AS count FROM tasks WHERE status = 'claimed' AND claimant = ?
            """, (handle,)).fetchone()["count"]
            if active >= claim_cap:
                raise HTTPException(409, f"At most {claim_cap} active task claims per contributor.")
            now = int(clock())
            updated = db.execute(f"""
                UPDATE tasks AS t SET status = 'claimed', claimant = ?, lease_until = ?, claimed_at = ?
                WHERE id = ? AND status = 'open' AND visibility = 'approved' AND {READY_FILTER}
                    AND EXISTS (SELECT 1 FROM goals g WHERE g.id = t.goal_id AND g.visibility = 'approved')
            """, (handle, now + lease_seconds, now, task_id))
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
                    AND visibility = 'approved'
                    AND EXISTS (SELECT 1 FROM goals WHERE goals.id = tasks.goal_id AND visibility = 'approved')
            """, (now + lease_seconds, now, task_id, handle, now))
            if not updated.rowcount:
                raise HTTPException(409, "Only the active claimant can heartbeat.")
        return task(task_id)

    def submit(task_id, data, handle):
        item = task(task_id)
        if item["status"] != "claimed" or item["claimant"] != handle:
            raise HTTPException(409, "Only the active claimant can submit a result.")
        if not re.fullmatch(re.escape(item["repo_url"]) + r"/pull/[1-9][0-9]*", data.pr_url, re.IGNORECASE):
            raise HTTPException(422, "Use a GitHub pull request URL on the goal repository.")
        check = pr_checker(data.pr_url, item["claimed_at"])
        if check == "invalid":
            raise HTTPException(422, "Use an open PR created after this claim.")
        with connect(engine, write=True) as db:
            expire(db)
            if db.connection.dialect.name == "postgresql":
                db.execute("SELECT pg_advisory_xact_lock(90192732)")
            if db.execute("SELECT 1 FROM tasks WHERE lower(pr_url) = lower(?)", (data.pr_url,)).fetchone():
                raise HTTPException(409, "That pull request is already linked to a task.")
            updated = db.execute("""
                UPDATE tasks SET status = 'submitted', lease_until = NULL, last_heartbeat = NULL,
                    pr_url = ?, summary = ?, pr_check = ?
                WHERE id = ? AND status = 'claimed' AND claimant = ? AND lease_until > ?
                    AND visibility = 'approved' AND claimed_at = ?
                    AND EXISTS (SELECT 1 FROM goals WHERE goals.id = tasks.goal_id AND visibility = 'approved')
            """, (data.pr_url, data.summary, check, task_id, handle, int(clock()), item["claimed_at"]))
            if not updated.rowcount:
                raise HTTPException(409, "Only the active claimant can submit a result.")
            if data.handoff:
                if data.handoff.diff_url and data.handoff.diff_url != data.pr_url + "/files":
                    raise HTTPException(422, "Use the submitted PR's /files URL as the diff link.")
                db.execute("INSERT INTO handoffs VALUES (?, ?)", (task_id, data.handoff.model_dump_json()))
            log(db, "submitted", "Submitted a pull request.", handle, item["goal_id"], task_id)
        return task(task_id)

    def done(task_id, handle):
        task(task_id)
        with connect(engine, write=True) as db:
            suffix = " FOR UPDATE OF t" if db.connection.dialect.name == "postgresql" else ""
            item = require_row(db.execute("""
                SELECT t.status, t.author, t.goal_id, g.author AS goal_author
                FROM tasks t JOIN goals g ON g.id = t.goal_id WHERE t.id = ?
            """ + suffix, (task_id,)).fetchone(), "Task")
            if handle not in {item["author"], item["goal_author"]}:
                raise HTTPException(403, "Only the goal or task proposer can mark a result done.")
            if item["status"] != "submitted":
                raise HTTPException(409, "A result must be submitted first.")
            handoff = db.execute("SELECT data FROM handoffs WHERE task_id = ?", (task_id,)).fetchone()
            checks = Handoff.model_validate_json(handoff["data"]).tests if handoff else []
            if not checks or not any(check.outcome == "passed" for check in checks) or any(
                check.outcome == "failed" for check in checks
            ):
                raise HTTPException(409, "A handoff with successful test results is required.")
            review = db.execute("""
                SELECT COUNT(*) AS approvals FROM reviews WHERE task_id = ? AND approved = 1
            """, (task_id,)).fetchone()
            if review["approvals"] < review_quorum:
                raise HTTPException(409, f"At least {review_quorum} independent approvals are required.")
            updated = db.execute("UPDATE tasks SET status = 'done' WHERE id = ? AND status = 'submitted'", (task_id,))
            if not updated.rowcount:
                raise HTTPException(409, "A result must be submitted first.")
            log(db, "done", "Marked a result done.", handle, item["goal_id"], task_id)
        return task(task_id)

    def review_task(task_id, data, handle):
        task(task_id)
        with connect(engine, write=True) as db:
            suffix = " FOR UPDATE" if db.connection.dialect.name == "postgresql" else ""
            item = require_row(db.execute("SELECT * FROM tasks WHERE id = ?" + suffix, (task_id,)).fetchone(), "Task")
            if item["status"] != "submitted":
                raise HTTPException(409, "Only a submitted task can be reviewed.")
            if item["claimant"] == handle:
                raise HTTPException(403, "Contributors cannot review their own result.")
            if data.submission_id != submission_id(db, task_id):
                raise HTTPException(409, "The submission changed. Reload the task before reviewing it.")
            saved = db.execute("""
                INSERT INTO reviews VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
            """, (task_id, handle, int(data.approved), data.summary, int(clock())))
            if not saved.rowcount:
                raise HTTPException(409, "A review from this contributor is already recorded.")
            log(db, "reviewed", "Reviewed a submitted pull request.", handle, item["goal_id"], task_id)
        return task(task_id)

    def active_claim(db, task_id, handle, now):
        suffix = " FOR UPDATE OF t" if db.connection.dialect.name == "postgresql" else ""
        item = require_row(db.execute(task_query + " WHERE t.id = ?" + suffix, (task_id,)).fetchone(), "Task")
        if (item["visibility"] != "approved" or item["goal_visibility"] != "approved" or
                item["status"] != "claimed" or item["claimant"] != handle or item["lease_until"] <= now):
            raise HTTPException(409, "An active task claim is required.")
        return item

    def reserve_path(task_id, data, handle):
        now = int(clock())
        with connect(engine, write=True) as db:
            item = active_claim(db, task_id, handle, now)
            return lease_path(db, task=item, handle=handle, data=data, now=now)

    def inspect_paths(task_id, data, handle):
        now = int(clock())
        with connect(engine, write=True) as db:
            item = active_claim(db, task_id, handle, now)
            return {"conflicts": check_paths(db, task=item, handle=handle, paths=data.paths, now=now)}

    def notes(goal_id):
        goal(goal_id)
        with connect(engine) as db:
            return [dict(row) for row in db.execute("""
                SELECT n.*, c.created_at AS author_created_at FROM notes n LEFT JOIN contributors c ON c.handle = n.author
                WHERE n.goal_id = ? AND n.visibility = 'approved' ORDER BY n.id DESC LIMIT 100
            """, (goal_id,))]

    def post_note(goal_id, data, handle):
        goal(goal_id)
        with connect(engine, write=True) as db:
            note_id = db.execute(
                "INSERT INTO notes (goal_id, author, body, created_at) VALUES (?, ?, ?, ?) RETURNING id",
                (goal_id, handle, data.body, int(clock())),
            ).fetchone()["id"]
            return dict(db.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone())

    def subtasks(parent_id, data, handle):
        parent = task(parent_id, handle)
        with connect(engine, write=True) as db:
            ids = [insert_task(db, parent["goal_id"], item, handle, parent_id) for item in data.tasks]
        return [task(task_id, any_visibility=True) for task_id in ids]

    def leaders():
        with connect(engine) as db:
            return [dict(row) for row in db.execute("""
                SELECT claimant AS handle, COUNT(*) AS contributions,
                    SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
                FROM tasks WHERE status IN ('submitted', 'done') AND visibility = 'approved'
                    AND EXISTS (SELECT 1 FROM goals WHERE goals.id = tasks.goal_id AND visibility = 'approved')
                GROUP BY claimant ORDER BY contributions DESC, done DESC, handle
            """)]

    def stats(goal_id=None):
        now = int(clock())
        running_filter = " AND goal_id = ?" if goal_id is not None else ""
        params = (now, now - 90) if goal_id is None else (now, now - 90, goal_id)
        with connect(engine) as db:
            return dict(db.execute(f"""
                SELECT
                (SELECT COUNT(*) FROM tasks WHERE status = 'claimed' AND visibility = 'approved' AND lease_until > ?
                    AND last_heartbeat > ? {running_filter}) AS agents_running,
                (SELECT COUNT(*) FROM contributors WHERE banned = 0 AND password_hash IS NOT NULL) AS contributors,
                (SELECT COUNT(*) FROM tasks WHERE status = 'done' AND visibility = 'approved' AND pr_url IS NOT NULL) AS prs_merged
            """, params).fetchone())

    def log(db, kind, summary, actor, goal_id=None, task_id=None, run_id=None):
        if db.connection.dialect.name == "postgresql":
            db.execute("SELECT pg_advisory_xact_lock(90192731)")
        return dict(db.execute("""
            INSERT INTO events (goal_id, task_id, actor, kind, summary, created_at, run_id)
            VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *
        """, (goal_id, task_id, actor, kind, summary, int(clock()), run_id)).fetchone())

    def activity(limit=20, goal_id=None, after=None):
        conditions, params = [
            "(goal_id IS NULL OR EXISTS (SELECT 1 FROM goals g WHERE g.id = events.goal_id AND g.visibility = 'approved'))",
            "(task_id IS NULL OR EXISTS (SELECT 1 FROM tasks t WHERE t.id = events.task_id AND t.visibility = 'approved'))",
        ], ()
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
                    AND claimant = ? AND lease_until > ? AND visibility = 'approved'
                    AND EXISTS (SELECT 1 FROM goals WHERE goals.id = tasks.goal_id AND visibility = 'approved')
                    RETURNING goal_id
            """, (*params, task_id, handle, now)).fetchone()
            if row is None:
                raise HTTPException(409, "Only the active claimant can post run events.")
            return log(db, data.kind, data.summary, handle, row["goal_id"], task_id, data.run_id)

    thread_query = """
        SELECT t.*, (SELECT COUNT(*) FROM thread_votes WHERE thread_id = t.id) AS votes,
            (SELECT COUNT(*) FROM comments WHERE thread_id = t.id AND visibility = 'approved') AS comment_count
        FROM threads t
    """
    comment_query = """
        SELECT c.*, (SELECT COUNT(*) FROM comment_votes WHERE comment_id = c.id) AS votes FROM comments c
    """

    thread_visible = """
        t.visibility = 'approved' AND (
            t.goal_id IS NULL OR EXISTS (SELECT 1 FROM goals g WHERE g.id = t.goal_id AND g.visibility = 'approved')
        )
    """

    def threads(goal_id=None, general=False, page=1, limit=20):
        query = thread_query + " WHERE " + thread_visible
        params = ()
        if goal_id is not None:
            query += " AND t.goal_id = ?"
            params = (goal_id,)
        elif general:
            query += " AND t.goal_id IS NULL"
        with connect(engine) as db:
            return [dict(row) for row in db.execute(
                query + " ORDER BY t.id DESC LIMIT ? OFFSET ?", (*params, limit, (page - 1) * limit),
            )]

    def thread_header(db, thread_id):
        return require_row(db.execute(thread_query + " WHERE t.id = ? AND " + thread_visible,
                                      (thread_id,)).fetchone(), "Thread")

    def thread(thread_id, page=1):
        with connect(engine) as db:
            item = thread_header(db, thread_id)
            offset = (page - 1) * REPLIES_PER_PAGE
            replies = [dict(row) for row in db.execute(
                comment_query + " WHERE c.thread_id = ? AND c.visibility = 'approved' ORDER BY c.id LIMIT ? OFFSET ?",
                (thread_id, REPLIES_PER_PAGE + 1, offset),
            )]
            item["comments"] = replies[:REPLIES_PER_PAGE]
            item["comments_page"] = page
            item["comments_next_page"] = page + 1 if len(replies) > REPLIES_PER_PAGE else None
            return item

    def comment(comment_id):
        with connect(engine) as db:
            item = require_row(db.execute(comment_query + " WHERE c.id = ? AND c.visibility = 'approved'",
                                          (comment_id,)).fetchone(), "Comment")
            thread_header(db, item["thread_id"])
        return item

    def add_thread(data, handle):
        if data.goal_id is not None:
            goal(data.goal_id)
        with connect(engine, write=True) as db:
            thread_id = db.execute("""
                INSERT INTO threads (goal_id, author, title, body, created_at)
                VALUES (?, ?, ?, ?, ?) RETURNING id
            """, (data.goal_id, handle, data.title, data.body, int(clock()))).fetchone()["id"]
            log(db, "thread", "Started a discussion.", handle, data.goal_id)
        return thread(thread_id)

    def add_comment(thread_id, data, handle):
        with connect(engine, write=True) as db:
            target = thread_header(db, thread_id)
            suffix = " FOR UPDATE" if db.connection.dialect.name == "postgresql" else ""
            selected = db.execute("SELECT locked, visibility FROM threads WHERE id = ?" + suffix, (thread_id,)).fetchone()
            if selected["locked"] or selected["visibility"] != "approved":
                raise HTTPException(409, "This discussion is locked.")
            comment_id = db.execute("""
                INSERT INTO comments (thread_id, author, body, created_at) VALUES (?, ?, ?, ?) RETURNING id
            """, (thread_id, handle, data.body, int(clock()))).fetchone()["id"]
            log(db, "comment", "Commented on a discussion.", handle, target["goal_id"])
        return comment(comment_id)

    def opaque_item(db, kind, item_id):
        if kind not in KINDS:
            raise HTTPException(404, "Unknown content type.")
        return require_row(db.execute(f"SELECT * FROM {kind} WHERE id = ?", (item_id,)).fetchone(), "Content")

    def public_parents(db, kind, item):
        if kind == "comments":
            parent = opaque_item(db, "threads", item["thread_id"])
            if parent["visibility"] != "approved":
                return False
            item = parent
        goal_id = item.get("goal_id")
        if goal_id is not None and opaque_item(db, "goals", goal_id)["visibility"] != "approved":
            return False
        if kind == "tasks" and item["parent_id"] is not None:
            hidden_parent = db.execute("""
                WITH RECURSIVE ancestors(id, parent_id, visibility) AS (
                    SELECT id, parent_id, visibility FROM tasks WHERE id = ?
                    UNION ALL
                    SELECT t.id, t.parent_id, t.visibility FROM tasks t JOIN ancestors a ON t.id = a.parent_id
                ) SELECT 1 FROM ancestors WHERE visibility <> 'approved' LIMIT 1
            """, (item["parent_id"],)).fetchone()
            return hidden_parent is None
        return True

    def report_content(kind, item_id, data, handle):
        with connect(engine, write=True) as db:
            item = opaque_item(db, kind, item_id)
            if item["visibility"] != "approved" or not public_parents(db, kind, item):
                raise HTTPException(404, "Content not found.")
            result = db.execute("""
                INSERT INTO reports (kind, item_id, reporter, reason, created_at)
                VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING id
            """, (kind, item_id, handle, data.reason, int(clock()))).fetchone()
            if result is None:
                raise HTTPException(409, "You already reported this item.")
            return {"id": result["id"]}

    def reset_claim(db, task_id):
        return db.execute("""
            UPDATE tasks SET status = 'open', claimant = NULL, lease_until = NULL,
                last_heartbeat = NULL, claimed_at = NULL
            WHERE id = ? AND status = 'claimed' RETURNING goal_id
        """, (task_id,)).fetchone()

    def release(task_id, handle):
        with connect(engine, write=True) as db:
            item = opaque_item(db, "tasks", task_id)
            if item["claimant"] != handle or item["status"] != "claimed":
                raise HTTPException(409, "Only the active claimant can release this claim.")
            changed = db.execute("""
                UPDATE tasks SET status = 'open', claimant = NULL, lease_until = NULL,
                    last_heartbeat = NULL, claimed_at = NULL
                WHERE id = ? AND status = 'claimed' AND claimant = ? RETURNING goal_id
            """, (task_id, handle)).fetchone()
            if changed is None:
                raise HTTPException(409, "Only the active claimant can release this claim.")
            db.execute("DELETE FROM path_leases WHERE task_id = ?", (task_id,))
            log(db, "released", "Released a task claim.", handle, changed["goal_id"], task_id)
        return task(task_id, any_visibility=True)

    def moderate(kind, item_id, data, handle):
        with connect(engine, write=True) as db:
            item = opaque_item(db, kind, item_id)
            staff = role_in(db, handle) in {"admin", "moderator"}
            goal_id = item_id if kind == "goals" else item.get("goal_id")
            if not staff:
                if data.action != "approve" or kind != "tasks" or opaque_item(db, "goals", goal_id)["author"] != handle:
                    raise HTTPException(403, "Moderator permission required.")
                if not public_parents(db, kind, item):
                    raise HTTPException(404, "Content not found.")
            if data.action in {"approve", "reject", "hide", "delete"}:
                statuses = {"approve": "approved", "reject": "rejected", "hide": "hidden", "delete": "deleted"}
                if item["visibility"] == "deleted":
                    raise HTTPException(409, "Deleted content cannot be restored.")
                if data.action == "approve" and not staff and item["visibility"] != "pending":
                    raise HTTPException(403, "Only moderators can restore removed content.")
                db.execute(f"UPDATE {kind} SET visibility = ? WHERE id = ?", (statuses[data.action], item_id))
                if data.action != "approve":
                    if kind == "tasks":
                        reset_claim(db, item_id)
                    elif kind == "goals":
                        for row in db.execute("SELECT id FROM tasks WHERE goal_id = ? AND status = 'claimed'", (item_id,)):
                            reset_claim(db, row["id"])
            elif data.action in {"lock", "unlock"} and kind == "threads":
                db.execute("UPDATE threads SET locked = ? WHERE id = ?", (int(data.action == "lock"), item_id))
            elif data.action == "release" and kind == "tasks":
                if reset_claim(db, item_id) is None:
                    raise HTTPException(409, "Task is not claimed.")
                db.execute("DELETE FROM path_leases WHERE task_id = ?", (item_id,))
            elif data.action == "reject_submission" and kind == "tasks":
                changed = db.execute("""
                    UPDATE tasks SET status = 'open', claimant = NULL, claimed_at = NULL,
                        pr_url = NULL, summary = NULL, pr_check = NULL WHERE id = ? AND status = 'submitted'
                """, (item_id,))
                if not changed.rowcount:
                    raise HTTPException(409, "Task is not submitted.")
                db.execute("DELETE FROM handoffs WHERE task_id = ?", (item_id,))
                db.execute("DELETE FROM reviews WHERE task_id = ?", (item_id,))
            else:
                raise HTTPException(422, "Action does not apply to this item.")
            db.execute("UPDATE reports SET resolved = 1 WHERE kind = ? AND item_id = ?", (kind, item_id))
            db.execute("INSERT INTO moderation_audit VALUES (?, ?, ?, ?, ?)",
                       (handle, data.action, f"{kind}/{item_id}", data.reason, int(clock())))
            log(db, "moderated", f"Moderation: {data.action} {kind} #{item_id}.", handle, goal_id,
                item_id if kind == "tasks" else None)
            return {"ok": True}

    def moderation_queue(handle):
        staff = moderator(handle)
        with connect(engine) as db:
            goal_sql = "SELECT id, title, author FROM goals WHERE visibility = 'pending'"
            task_sql = """
                SELECT t.id, t.goal_id, t.title, t.author FROM tasks t JOIN goals g ON t.goal_id = g.id
                WHERE t.visibility = 'pending'
            """
            goals_pending = [dict(row) for row in db.execute(
                goal_sql + (" ORDER BY id DESC LIMIT 100" if staff else " AND author = ? ORDER BY id DESC LIMIT 100"),
                () if staff else (handle,),
            )]
            tasks_pending = [dict(row) for row in db.execute(
                task_sql + (" ORDER BY t.id DESC LIMIT 100" if staff else " AND (t.author = ? OR g.author = ?) ORDER BY t.id DESC LIMIT 100"),
                () if staff else (handle, handle),
            )]
            reports = [dict(row) for row in db.execute("""
                SELECT * FROM reports WHERE resolved = 0 ORDER BY id DESC LIMIT 100
            """)] if staff else []
            return {"goals": goals_pending, "tasks": tasks_pending, "reports": reports, "moderator": staff}

    def set_role(target, data, handle):
        with connect(engine, write=True) as db:
            if role_in(db, handle) != "admin":
                raise HTTPException(403, "Admin permission required.")
            changed = db.execute("""
                UPDATE contributors SET role = ? WHERE handle = ? AND role <> 'admin'
            """, (data.role, target))
            if not changed.rowcount:
                raise HTTPException(404, "Manageable account not found.")
        return {"ok": True}

    def ban(target, handle, data):
        with connect(engine, write=True) as db:
            if role_in(db, handle) not in {"admin", "moderator"}:
                raise HTTPException(403, "Moderator permission required.")
            result = db.execute("UPDATE contributors SET banned = 1 WHERE handle = ? AND role = 'contributor'", (target,))
            if not result.rowcount:
                raise HTTPException(404, "Manageable contributor not found.")
            db.execute("DELETE FROM sessions WHERE handle = ?", (target,))
            for table in ("goals", "tasks", "threads", "comments", "notes"):
                db.execute(f"UPDATE {table} SET visibility = 'hidden' WHERE author = ? AND visibility <> 'deleted'", (target,))
            for item in db.execute("""
                SELECT id FROM tasks WHERE status = 'claimed' AND (claimant = ? OR visibility = 'hidden'
                    OR EXISTS (SELECT 1 FROM goals WHERE goals.id = tasks.goal_id AND visibility = 'hidden'))
            """, (target,)):
                reset_claim(db, item["id"])
            for table in ("goal_votes", "task_votes", "thread_votes", "comment_votes"):
                db.execute(f"DELETE FROM {table} WHERE handle = ?", (target,))
            db.execute("INSERT INTO moderation_audit VALUES (?, ?, ?, ?, ?)",
                       (handle, "ban", target, data.reason, int(clock())))
            log(db, "moderated", "Suspended a contributor.", handle)
        return {"ok": True}

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
    def api_logout(request: Request, response: Response, _handle: str = auth):
        logout(request, response)
        return {"ok": True}

    github_configured = bool(os.environ.get("GITHUB_OAUTH_CLIENT_ID") and os.environ.get("GITHUB_OAUTH_CLIENT_SECRET"))

    @api.get("/auth/github", include_in_schema=github_configured, deprecated=True,
             summary="Reserved: GitHub OAuth is not implemented")
    def api_github():
        if not github_configured:
            raise HTTPException(404, "GitHub OAuth is not configured.")
        raise HTTPException(501, "GitHub OAuth is planned but not implemented.")

    @api.post("/contributors", status_code=201)
    def api_signup(data: Signup):
        return signup(data.handle)

    @api.get("/me")
    def api_me(handle: str = auth):
        return {"handle": handle}

    @api.get("/goals", response_model=list[GoalResponse])
    def api_goals(handle: str | None = read_viewer):
        voted = vote_state(handle, "goals")["goals"]
        return [with_viewer_vote(item, voted) for item in goals()]

    @api.post("/goals", status_code=201, response_model=GoalResponse)
    def api_add_goal(data: GoalInput, handle: str = auth):
        return add_goal(data, handle)

    @api.get("/goals/featured", response_model=GoalResponse | None)
    def api_featured(handle: str | None = read_viewer):
        item = featured()
        if item is None:
            return None
        return with_viewer_vote(item, vote_state(handle, "goals")["goals"])

    @api.get("/goals/{goal_id}", response_model=GoalResponse)
    def api_goal(goal_id: int, handle: str | None = read_viewer):
        return with_viewer_vote(goal(goal_id, handle), vote_state(handle, "goals")["goals"])

    @api.get("/goals/{goal_id}/progress", response_model=ProgressResponse)
    def api_progress(goal_id: int):
        return goal(goal_id)["progress"]

    @api.post("/goals/{goal_id}/tasks", status_code=201)
    def api_add_task(goal_id: int, data: TaskInput, handle: str = auth):
        return add_task(goal_id, data, handle)

    @api.get("/tasks", response_model=list[VotableResponse])
    def api_tasks(goal_id: int | None = None, available: bool = False, handle: str | None = read_viewer):
        if goal_id is not None:
            goal(goal_id)
        voted = vote_state(handle, "tasks")["tasks"]
        return [with_viewer_vote(item, voted) for item in tasks(goal_id, available)]

    @api.get("/tasks/{task_id}", response_model=VotableResponse)
    def api_task(task_id: int, handle: str | None = read_viewer):
        return with_viewer_vote(task(task_id, handle), vote_state(handle, "tasks")["tasks"])

    @api.post("/{kind}/{item_id}/vote", response_model=VotableResponse)
    def api_vote(kind: Literal["goals", "tasks", "threads", "comments"], item_id: int, handle: str = auth):
        return vote(kind, item_id, handle)

    @api.delete("/{kind}/{item_id}/vote", response_model=VotableResponse)
    def api_unvote(kind: Literal["goals", "tasks", "threads", "comments"], item_id: int, handle: str = auth):
        return vote(kind, item_id, handle, remove=True)

    @api.post("/tasks/{task_id}/claim")
    def api_claim(task_id: int, handle: str = auth):
        return claim(task_id, handle)

    @api.post("/tasks/{task_id}/release")
    def api_release(task_id: int, handle: str = auth):
        return release(task_id, handle)

    @api.post("/tasks/{task_id}/heartbeat")
    def api_heartbeat(task_id: int, handle: str = auth):
        return heartbeat(task_id, handle)

    @api.post("/tasks/{task_id}/events", status_code=201, response_model=EventResponse)
    def api_run_event(task_id: int, data: EventInput, handle: str = auth):
        return run_event(task_id, data, handle)

    @api.post("/tasks/{task_id}/submit")
    def api_submit(task_id: int, data: Submission, handle: str = auth):
        return submit(task_id, data, handle)

    @api.post("/tasks/{task_id}/done")
    def api_done(task_id: int, handle: str = auth):
        return done(task_id, handle)

    @api.post("/tasks/{task_id}/reviews", status_code=201)
    def api_review(task_id: int, data: ReviewInput, handle: str = auth):
        return review_task(task_id, data, handle)

    @api.post("/tasks/{task_id}/path-leases", status_code=201)
    def api_lease(task_id: int, data: PathLeaseInput, handle: str = auth):
        return reserve_path(task_id, data, handle)

    @api.post("/tasks/{task_id}/paths/check")
    def api_check(task_id: int, data: PathCheckInput, handle: str = auth):
        return inspect_paths(task_id, data, handle)

    @api.get("/goals/{goal_id}/notes")
    def api_notes(goal_id: int):
        return notes(goal_id)

    @api.post("/goals/{goal_id}/notes", status_code=201)
    def api_note(goal_id: int, data: NoteInput, handle: str = auth):
        return post_note(goal_id, data, handle)

    @api.post("/tasks/{task_id}/subtasks", status_code=201)
    def api_subtasks(task_id: int, data: SubtasksInput, handle: str = auth):
        return subtasks(task_id, data, handle)

    @api.get("/leaderboard")
    def api_leaders():
        return leaders()

    @api.get("/stats")
    def api_stats(goal_id: int | None = None):
        return stats(goal_id)

    @api.get("/activity", response_model=list[EventResponse])
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

    @api.get("/threads", response_model=list[VotableResponse])
    def api_threads(goal_id: int | None = None, general: bool = False, page: int = 1, limit: int = 20,
                    handle: str | None = read_viewer):
        voted = vote_state(handle, "threads")["threads"]
        items = threads(goal_id, general, max(1, min(page, 10000)), max(1, min(limit, 50)))
        return [with_viewer_vote(item, voted) for item in items]

    @api.post("/threads", status_code=201)
    def api_add_thread(data: ThreadInput, handle: str = auth):
        return add_thread(data, handle)

    @api.get("/threads/{thread_id}", response_model=ThreadDetailResponse)
    def api_thread(thread_id: int, page: int = 1, handle: str | None = read_viewer):
        item = thread(thread_id, max(1, min(page, 10000)))
        votes = vote_state(handle, "threads", "comments")
        item["comments"] = [with_viewer_vote(comment, votes["comments"]) for comment in item["comments"]]
        return with_viewer_vote(item, votes["threads"])

    @api.post("/threads/{thread_id}/comments", status_code=201)
    def api_comment(thread_id: int, data: NoteInput, handle: str = auth):
        return add_comment(thread_id, data, handle)

    @api.post("/{kind}/{item_id}/report", status_code=201)
    def api_report(kind: Kind, item_id: int, data: ReportInput, handle: str = auth):
        return report_content(kind, item_id, data, handle)

    @api.get("/moderation/queue")
    def api_moderation_queue(handle: str = auth):
        return moderation_queue(handle)

    @api.post("/moderation/{kind}/{item_id}")
    def api_moderate(kind: Kind, item_id: int, data: ModerationInput, handle: str = auth):
        return moderate(kind, item_id, data, handle)

    @api.post("/moderation/contributors/{target}/role")
    def api_role(target: str, data: RoleInput, handle: str = auth):
        return set_role(target, data, handle)

    @api.post("/moderation/contributors/{target}/ban")
    def api_ban(target: str, data: ReportInput, handle: str = auth):
        return ban(target, handle, data)

    app.include_router(api)

    def page(request, template, *, status_code=200, **context):
        handle = viewer(request, web=True)
        return templates.TemplateResponse(
            request=request, name=template,
            context={"viewer": handle, "my_votes": vote_state(handle, "goals", "tasks", "threads", "comments"), **context},
            status_code=status_code,
        )

    @app.get("/")
    def home(request: Request):
        items = goals()
        current = next((item for item in items if item["progress"]["percent_done"] < 100), items[0] if items else None)
        return page(request, "home.html", goals=items, featured=current, stats=stats(),
                    open_count=sum(item["progress"]["open"] for item in items))

    def render_goal(goal_id, request, **context):
        handle = viewer(request, web=True)
        target = goal(goal_id, handle)
        live = target["visibility"] == "approved"
        return page(request, "goal.html", goal=target, tasks=tasks(goal_id, handle=handle),
                    notes=notes(goal_id) if live else [], threads=threads(goal_id) if live else [],
                    can_approve=bool(handle and (target["author"] == handle or moderator(handle))), **context)

    @app.get("/goals/{goal_id}")
    def goal_page(goal_id: int, request: Request):
        return render_goal(goal_id, request)

    @app.get("/leaderboard")
    def leaderboard(request: Request):
        return page(request, "leaderboard.html", leaders=leaders())

    @app.get("/contribute")
    def contribute(request: Request):
        return page(request, "contribute.html")

    def return_path(value):
        if not isinstance(value, str) or not value.startswith("/") or value.startswith("//"):
            return "/"
        if len(value) > 1000 or "\\" in value or any(ord(symbol) < 32 for symbol in value):
            return "/"
        return value

    @app.get("/join")
    def join_page(request: Request, next: str = "/"):
        return page(request, "join.html", next_path=return_path(next))

    def redirect(url):
        return RedirectResponse(url, status_code=303)

    def web_origin(request, *, allow_cors_origin=False):
        origin = request.headers.get("origin")
        if allow_cors_origin and cors_credentials and origin != "null" and origin in origins:
            return
        if request.headers.get("sec-fetch-site") == "cross-site":
            raise HTTPException(403, "Cross-site form submissions are not allowed.")
        source = origin or request.headers.get("referer")
        if source:
            try:
                incoming = urlsplit(source)
                expected = urlsplit(os.environ.get("SWARM_PUBLIC_ORIGIN") or str(request.base_url))
                if (incoming.scheme, incoming.netloc) == (expected.scheme, expected.netloc):
                    return
            except ValueError:
                pass
            raise HTTPException(403, "Cross-site form submissions are not allowed.")

    @app.post("/join")
    async def join(request: Request):
        web_origin(request)
        form = await request.form()
        next_path = return_path(form.get("next"))
        action = form.get("action") or "register"
        try:
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
            return page(request, "join.html", status_code=400, error=error, error_action=action,
                        username_draft=form.get("username", ""), next_path=next_path)
        response = redirect(next_path)
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
        handle = viewer(request, web=True)
        parent = task(parent_id, handle) if parent_id is not None else None
        target = goal(parent["goal_id"] if parent else goal_id, handle) if parent or goal_id is not None else None
        return page(request, "propose.html", goal=target, parent=parent)

    @app.post("/propose")
    async def propose_post(request: Request, goal_id: int | None = None, parent_id: int | None = None):
        web_origin(request)
        handle = contributor(request, web=True)
        parent = task(parent_id, handle) if parent_id is not None else None
        target = goal(parent["goal_id"] if parent else goal_id, handle) if parent or goal_id is not None else None
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
    def web_vote(kind: str, item_id: int, request: Request, remove: bool = False):
        web_origin(request)
        item = vote(kind, item_id, contributor(request, web=True), remove=remove)
        if kind == "threads":
            return redirect(f"/forum/{item_id}")
        if kind == "comments":
            return redirect(comment_location(item))
        if kind == "tasks":
            return redirect(f"/goals/{item['goal_id']}#task-{item_id}")
        return redirect(f"/goals/{item_id}")

    @app.post("/goals/{goal_id}/notes")
    async def web_note(goal_id: int, request: Request):
        web_origin(request)
        handle = contributor(request, web=True)
        form = dict(await request.form())
        try:
            post_note(goal_id, NoteInput.model_validate(form), handle)
        except ValidationError:
            return render_goal(goal_id, request, status_code=422, note_error="Enter a note of 1–5000 characters.",
                               note_draft=form.get("body", ""))
        return redirect(f"/goals/{goal_id}#scratchpad")

    @app.post("/tasks/{task_id}/done")
    def web_done(task_id: int, request: Request):
        web_origin(request)
        item = done(task_id, contributor(request, web=True))
        return redirect(f"/goals/{item['goal_id']}#task-{task_id}")

    @app.post("/tasks/{task_id}/release")
    def web_release(task_id: int, request: Request):
        web_origin(request)
        item = release(task_id, contributor(request, web=True))
        return redirect(f"/goals/{item['goal_id']}#task-{task_id}")

    @app.post("/tasks/{task_id}/reviews")
    async def web_review(task_id: int, request: Request):
        web_origin(request)
        handle = contributor(request, web=True)
        try:
            item = review_task(task_id, ReviewInput.model_validate(dict(await request.form())), handle)
        except ValidationError:
            raise HTTPException(422, "Reload the submission, then choose a verdict and enter a review note.") from None
        return redirect(f"/goals/{item['goal_id']}#task-{task_id}")

    @app.get("/forum")
    def forum(request: Request, goal_id: int | None = None, page_number: int = 1):
        target = goal(goal_id) if goal_id is not None else None
        page_number = max(1, min(page_number, 10000))
        return page(request, "forum.html", threads=threads(goal_id, general=goal_id is None, page=page_number),
                    goal=target, page_number=page_number)

    @app.post("/forum")
    async def web_thread(request: Request, goal_id: int | None = None):
        web_origin(request)
        handle = contributor(request, web=True)
        form = dict(await request.form())
        try:
            item = add_thread(ThreadInput.model_validate({**form, "goal_id": goal_id}), handle)
        except ValidationError:
            target = goal(goal_id) if goal_id is not None else None
            return page(request, "forum.html", status_code=422, goal=target, page_number=1,
                        threads=threads(goal_id, general=goal_id is None), error="Enter a title and discussion text.",
                        draft_title=form.get("title", ""), draft_body=form.get("body", ""))
        return redirect(f"/forum/{item['id']}")

    @app.get("/forum/{thread_id}")
    def thread_page(thread_id: int, request: Request, page_number: Annotated[int, Query(alias="page")] = 1):
        return page(request, "thread.html", thread=thread(thread_id, max(1, min(page_number, 10000))))

    def comment_location(item):
        with connect(engine) as db:
            preceding = db.execute("""
                SELECT COUNT(*) AS total FROM comments WHERE thread_id = ? AND visibility = 'approved' AND id < ?
            """, (item["thread_id"], item["id"])).fetchone()["total"]
        page_number = preceding // REPLIES_PER_PAGE + 1
        query = f"?page={page_number}" if page_number > 1 else ""
        return f"/forum/{item['thread_id']}{query}#comment-{item['id']}"

    @app.post("/forum/{thread_id}/comments")
    async def web_comment(thread_id: int, request: Request, page_number: Annotated[int, Query(alias="page")] = 1):
        web_origin(request)
        handle = contributor(request, web=True)
        form = dict(await request.form())
        try:
            item = add_comment(thread_id, NoteInput.model_validate(form), handle)
        except ValidationError:
            return page(request, "thread.html", status_code=422, thread=thread(thread_id, max(1, min(page_number, 10000))),
                        error="Enter a reply of 1–5000 characters.", draft_body=form.get("body", ""))
        return redirect(comment_location(item))

    @app.get("/watch")
    def watch(request: Request, goal_id: int | None = None):
        target = goal(goal_id) if goal_id is not None else None
        items = activity(goal_id=goal_id)
        return page(request, "watch.html", goal=target, activity=items, cursor=items[0]["id"] if items else 0,
                    stats=stats(goal_id))

    @app.get("/moderation")
    def moderation_page(request: Request):
        handle = contributor(request, web=True)
        return page(request, "moderation.html", queue=moderation_queue(handle), admin=role(handle) == "admin")

    @app.get("/report/{kind}/{item_id}")
    def report_page(kind: Kind, item_id: int, request: Request):
        return page(request, "report.html", kind=kind, item_id=item_id)

    @app.post("/report/{kind}/{item_id}")
    async def web_report(kind: Kind, item_id: int, request: Request):
        web_origin(request)
        try:
            data = ReportInput.model_validate(dict(await request.form()))
        except ValidationError:
            raise HTTPException(422, "Enter a report reason.") from None
        report_content(kind, item_id, data, contributor(request, web=True))
        return page(request, "report.html", kind=kind, item_id=item_id, submitted=True)

    @app.post("/moderation/{kind}/{item_id}")
    async def web_moderate(kind: Kind, item_id: int, request: Request):
        web_origin(request)
        try:
            data = ModerationInput.model_validate(dict(await request.form()))
        except ValidationError:
            raise HTTPException(422, "Enter a moderation reason and choose an action.") from None
        moderate(kind, item_id, data, contributor(request, web=True))
        return redirect("/moderation")

    @app.post("/moderation/ban")
    async def web_ban(request: Request):
        web_origin(request)
        form = dict(await request.form())
        try:
            data = ReportInput.model_validate(form)
            target = Signup(handle=form.get("target")).handle
        except ValidationError:
            raise HTTPException(422, "Enter a contributor handle and a reason.") from None
        ban(target, contributor(request, web=True), data)
        return redirect("/moderation")

    return app


app = create_app()
