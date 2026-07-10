"""Neon-backed persistence for the Trakt auth token.

Replaces local-file storage. Render's free tier has no persistent disk
across container restarts (spin-down after inactivity recreates the
container), so the token must live in an external store to survive that.
"""

import logging
import os
from typing import Final

import psycopg2
from psycopg2.extras import Json

from models.auth import TraktAuthToken

logger = logging.getLogger(__name__)

NEON_DATABASE_URL: Final[str | None] = os.environ.get("NEON_DATABASE_URL")

_TOKEN_ROW_ID = "default"


def _get_connection():
    if not NEON_DATABASE_URL:
        raise RuntimeError("NEON_DATABASE_URL is not set")
    return psycopg2.connect(NEON_DATABASE_URL)


def load_token() -> TraktAuthToken | None:
    """Load the auth token from Neon.

    Returns:
        The stored token, or None if not set or on error.
    """
    if not NEON_DATABASE_URL:
        logger.warning("NEON_DATABASE_URL not set, cannot load auth token")
        return None
    try:
        with _get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT token_data FROM trakt_oauth_tokens WHERE id = %s",
                (_TOKEN_ROW_ID,),
            )
            row = cur.fetchone()
            if row is None:
                return None
            return TraktAuthToken.model_validate(row[0])
    except Exception:
        logger.exception("Error loading auth token from Neon")
        return None


def save_token(token: TraktAuthToken) -> None:
    """Upsert the auth token into Neon."""
    with _get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO trakt_oauth_tokens (id, token_data, updated_at)
            VALUES (%s, %s, now())
            ON CONFLICT (id) DO UPDATE
                SET token_data = EXCLUDED.token_data,
                    updated_at = now()
            """,
            (_TOKEN_ROW_ID, Json(token.model_dump())),
        )
        conn.commit()


def clear_token() -> bool:
    """Delete the stored auth token from Neon.

    Returns:
        True if a row was deleted, False if there was nothing to delete.
    """
    with _get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM trakt_oauth_tokens WHERE id = %s",
            (_TOKEN_ROW_ID,),
        )
        deleted = cur.rowcount > 0
        conn.commit()
        return deleted
