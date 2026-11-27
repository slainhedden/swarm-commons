from alembic import op


revision = "0002"
down_revision = "0001"


def upgrade():
    op.execute("""
        CREATE TABLE task_dependencies (
            task_id INTEGER NOT NULL REFERENCES tasks(id),
            dependency_id INTEGER NOT NULL REFERENCES tasks(id),
            PRIMARY KEY (task_id, dependency_id),
            CHECK (task_id <> dependency_id)
        )
    """)
    op.execute("""
        CREATE TABLE handoffs (
            task_id INTEGER PRIMARY KEY REFERENCES tasks(id),
            data TEXT NOT NULL
        )
    """)
    op.execute("""
        CREATE TABLE reviews (
            task_id INTEGER NOT NULL REFERENCES tasks(id),
            reviewer TEXT NOT NULL REFERENCES contributors(handle),
            approved INTEGER NOT NULL,
            summary TEXT NOT NULL,
            created_at BIGINT NOT NULL,
            PRIMARY KEY (task_id, reviewer)
        )
    """)
    op.execute("""
        CREATE TABLE path_leases (
            repo TEXT NOT NULL,
            path TEXT NOT NULL,
            task_id INTEGER NOT NULL REFERENCES tasks(id),
            holder TEXT NOT NULL REFERENCES contributors(handle),
            mode TEXT NOT NULL,
            expires_at BIGINT NOT NULL,
            PRIMARY KEY (repo, path, task_id),
            CHECK (mode IN ('shared', 'exclusive'))
        )
    """)


def downgrade():
    for table in ("path_leases", "reviews", "handoffs", "task_dependencies"):
        op.drop_table(table)
