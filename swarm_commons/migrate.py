import os
from pathlib import Path

from .store import database, migrate


def main():
    path = Path(os.environ.get("SWARM_DB", "swarm.sqlite3"))
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        path.parent.mkdir(parents=True, exist_ok=True)
    engine = database(path, database_url)
    try:
        migrate(engine)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
