"""
Create the target PostgreSQL database if it does not exist (migration "Step 1").

Connects to the server's default `postgres` maintenance database using the same
host / credentials, then issues `CREATE DATABASE` for the configured target
(`PG_DATABASE`, or the database named in `DATABASE_URL`). Safe to re-run.

Usage (from backend/, with the Azure PG_* / DATABASE_URL set in .env):

    python scripts/create_database.py
"""
from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import psycopg  # noqa: E402
from psycopg import sql  # noqa: E402

from app.config import settings  # noqa: E402


def _maintenance_dsn_and_target() -> tuple[str, str]:
    dsn = settings.effective_database_url
    if not dsn:
        raise SystemExit("ERROR: no DATABASE_URL / PG_* configured in .env")
    parts = urlsplit(dsn)
    target_db = parts.path.lstrip("/") or "postgres"
    # Connect to the 'postgres' maintenance DB on the same server; keep the auth,
    # host, and query string (sslmode=require) intact.
    maintenance = urlunsplit((parts.scheme, parts.netloc, "/postgres", parts.query, ""))
    return maintenance, target_db


def main() -> int:
    maintenance_dsn, target = _maintenance_dsn_and_target()
    if target == "postgres":
        print("Target database is 'postgres' (the maintenance DB) — nothing to create.")
        return 0

    with psycopg.connect(maintenance_dsn, autocommit=True) as conn:
        exists = conn.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s", (target,)
        ).fetchone()
        if exists:
            print(f"Database '{target}' already exists — nothing to do.")
            return 0
        # CREATE DATABASE cannot run in a transaction and its name cannot be a
        # bound parameter; the name comes from our own config, quoted safely.
        conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(target)))
        print(f"Created database '{target}'.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
