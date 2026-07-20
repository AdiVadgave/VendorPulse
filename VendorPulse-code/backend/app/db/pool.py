"""
Process-wide PostgreSQL connection pool.

A single lazily-opened `psycopg_pool.ConnectionPool` is shared by every
repository. Connections run in autocommit mode so each CRUD statement is a
self-contained write-through — matching the semantics the JSON store had, where
every `insert`/`update`/`delete` was immediately durable.
"""
from __future__ import annotations

import logging
from functools import lru_cache

from psycopg_pool import ConnectionPool

from app.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_pool() -> ConnectionPool:
    dsn = settings.effective_database_url
    if not dsn:
        raise RuntimeError(
            "No PostgreSQL connection configured. Set DATABASE_URL (or the PG_* "
            "variables) in the backend .env before starting the app."
        )
    pool = ConnectionPool(
        conninfo=dsn,
        min_size=settings.pg_pool_min,
        max_size=settings.pg_pool_max,
        kwargs={"autocommit": True},
        open=True,
    )
    logger.info(
        "PostgreSQL pool opened — host=%s db=%s (min=%d max=%d)",
        settings.pg_host or "<from DATABASE_URL>",
        settings.pg_database,
        settings.pg_pool_min,
        settings.pg_pool_max,
    )
    return pool


def close_pool() -> None:
    """Close the pool if it was ever opened (called on app shutdown)."""
    if get_pool.cache_info().currsize:
        get_pool().close()
        get_pool.cache_clear()
        logger.info("PostgreSQL pool closed")
