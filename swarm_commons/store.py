from contextlib import contextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, event
from sqlalchemy.engine import URL, make_url


SCHEMA = """
CREATE TABLE IF NOT EXISTS contributors (
    handle TEXT PRIMARY KEY,
    password_hash TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    handle TEXT NOT NULL REFERENCES contributors(handle),
    expires_at BIGINT
);
CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    repo_url TEXT NOT NULL,
    author TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    goal_id INTEGER NOT NULL REFERENCES goals(id),
    parent_id INTEGER REFERENCES tasks(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    criteria TEXT NOT NULL,
    author TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    claimant TEXT,
    lease_until BIGINT,
    last_heartbeat BIGINT,
    pr_url TEXT,
    summary TEXT
);
CREATE TABLE IF NOT EXISTS goal_votes (
    goal_id INTEGER NOT NULL REFERENCES goals(id),
    handle TEXT NOT NULL,
    PRIMARY KEY (goal_id, handle)
);
CREATE TABLE IF NOT EXISTS task_votes (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    handle TEXT NOT NULL,
    PRIMARY KEY (task_id, handle)
);
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY,
    goal_id INTEGER NOT NULL REFERENCES goals(id),
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    goal_id INTEGER REFERENCES goals(id),
    task_id INTEGER REFERENCES tasks(id),
    actor TEXT NOT NULL,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS threads (
    id INTEGER PRIMARY KEY,
    goal_id INTEGER REFERENCES goals(id),
    author TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY,
    thread_id INTEGER NOT NULL REFERENCES threads(id),
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS thread_votes (
    thread_id INTEGER NOT NULL REFERENCES threads(id),
    handle TEXT NOT NULL,
    PRIMARY KEY (thread_id, handle)
);
CREATE TABLE IF NOT EXISTS comment_votes (
    comment_id INTEGER NOT NULL REFERENCES comments(id),
    handle TEXT NOT NULL,
    PRIMARY KEY (comment_id, handle)
);
"""

DEMO = (
    (
        "Make command-line tools easier to explore",
        "Improve the documentation people use to discover and learn Python CLI tooling.",
        "https://github.com/pallets/click",
        (
            ("Clarify the shell completion quickstart", "Review the setup instructions from a new user's perspective.", "Include a concise example for one supported shell and verify its commands."),
            ("Add a small plugin discovery example", "Show how a CLI can list available commands.", "Use public Click APIs and keep the example runnable."),
        ),
    ),
    (
        "Help beginners work with HTTP APIs",
        "Make common HTTP client patterns more approachable with practical examples.",
        "https://github.com/encode/httpx",
        (
            ("Explain timeout settings with examples", "Help readers choose timeout settings for common workflows.", "Show a working configuration using the public API and explain each timeout."),
        ),
    ),
    (
        "Reduce friction in Python packaging",
        "Improve the entry points to open-source packaging documentation.",
        "https://github.com/pypa/packaging.python.org",
        (
            ("Review the packaging tutorial prerequisites", "Identify where a first-time contributor might get stuck.", "Document the tools required and verify the suggested commands in a clean environment."),
        ),
    ),
)


def database(path, database_url=None):
    if database_url:
        url = make_url(database_url)
        if url.get_backend_name() in {"postgres", "postgresql"}:
            url = url.set(drivername="postgresql+psycopg")
        else:
            raise ValueError("DATABASE_URL must point to PostgreSQL.")
    else:
        url = URL.create("sqlite", database=str(path))
    engine = create_engine(url, pool_pre_ping=bool(database_url))
    if not database_url:
        @event.listens_for(engine, "connect")
        def sqlite_foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys = ON")
    return engine


class Query:
    def __init__(self, result):
        self.result = result
        self.rows = result.mappings() if result.returns_rows else None

    def fetchone(self):
        return self.rows.fetchone()

    def __iter__(self):
        return iter(self.rows)

    @property
    def rowcount(self):
        return self.result.rowcount


class Connection:
    def __init__(self, connection):
        self.connection = connection

    def execute(self, statement, parameters=()):
        if self.connection.dialect.name == "postgresql":
            statement = statement.replace("?", "%s")
        return Query(self.connection.exec_driver_sql(statement, parameters))


@contextmanager
def connect(engine, *, write=False):
    with engine.begin() as connection:
        if write and engine.dialect.name == "sqlite":
            connection.exec_driver_sql("BEGIN IMMEDIATE")
        yield Connection(connection)


def migrate(engine):
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")


def initialize(engine, seed, now, lease_seconds):
    if seed:
        with connect(engine, write=True) as db:
            if db.execute("SELECT 1 FROM goals LIMIT 1").fetchone():
                return
            for title, description, repo_url, tasks in DEMO:
                goal_id = db.execute(
                    "INSERT INTO goals (title, description, repo_url, author) VALUES (?, ?, ?, 'demo') RETURNING id",
                    (title, description, repo_url),
                ).fetchone()["id"]
                for task in tasks:
                    db.execute(
                        "INSERT INTO tasks (goal_id, title, description, criteria, author) VALUES (?, ?, ?, ?, 'demo')",
                        (goal_id, *task),
                    )
            db.execute("""
                UPDATE tasks SET status = 'claimed', claimant = 'demo-alex', lease_until = ?, last_heartbeat = ?
                WHERE id = 2
            """, (now + lease_seconds, now))
            db.execute("""
                INSERT INTO events (goal_id, task_id, actor, kind, summary, created_at)
                VALUES (1, 2, 'demo-alex', 'started', 'Demo contributor started reviewing plugin discovery.', ?)
            """, (now,))
            for goal_id, title, body in (
                (1, "Which shell should we cover first?", "Let's start with the shells mentioned in the current quickstart."),
                (None, "Welcome to Swarm Commons", "Share an open-source problem you would like help solving."),
            ):
                thread_id = db.execute("""
                    INSERT INTO threads (goal_id, author, title, body, created_at)
                    VALUES (?, 'demo', ?, ?, ?) RETURNING id
                """, (goal_id, title, body, now)).fetchone()["id"]
                db.execute("""
                    INSERT INTO comments (thread_id, author, body, created_at)
                    VALUES (?, 'demo-alex', 'Happy to review examples and help with setup.', ?)
                """, (thread_id, now))
