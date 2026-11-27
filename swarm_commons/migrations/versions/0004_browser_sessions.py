from alembic import op


revision = "0004"
down_revision = "0003"


def upgrade():
    op.execute("""
        ALTER TABLE sessions ADD COLUMN source_token_hash TEXT REFERENCES sessions(token_hash) ON DELETE CASCADE
    """)
    op.execute("CREATE INDEX sessions_source_token_hash ON sessions (source_token_hash)")


def downgrade():
    op.drop_index("sessions_source_token_hash", table_name="sessions")
    op.drop_column("sessions", "source_token_hash")
