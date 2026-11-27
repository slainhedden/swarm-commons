import argparse
import getpass
import os
import re
import time
from pathlib import Path

from .accounts import password_hash
from .moderation import admin_handles
from .store import connect, database


def main():
    parser = argparse.ArgumentParser(description="Provision a Swarm admin reserved by SWARM_ADMINS.")
    parser.add_argument("handle")
    args = parser.parse_args()
    if args.handle not in admin_handles() or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{1,38}", args.handle):
        parser.error("Reserve this valid handle with SWARM_ADMINS before provisioning.")
    password = getpass.getpass("Admin Swarm account password: ")
    if not 12 <= len(password) <= 128:
        parser.error("Choose a 12–128 character password.")
    hashed = password_hash(password)
    engine = database(Path(os.environ.get("SWARM_DB", "swarm.sqlite3")), os.environ.get("DATABASE_URL"))
    try:
        with connect(engine, write=True) as db:
            created = db.execute("""
                INSERT INTO contributors (handle, password_hash, role, created_at)
                VALUES (?, ?, 'admin', ?) ON CONFLICT DO NOTHING
            """, (args.handle, hashed, int(time.time())))
            if not created.rowcount:
                parser.error("That account already exists. Provision a new reserved handle.")
    finally:
        engine.dispose()
    print(f"Provisioned Swarm admin @{args.handle}.")


if __name__ == "__main__":
    main()
