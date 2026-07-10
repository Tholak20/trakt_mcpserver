"""Authentication client for Trakt API."""

import asyncio
import logging
import threading
import time

from config.auth import OAUTH_REDIRECT_URI
from config.endpoints import TRAKT_ENDPOINTS
from models.auth import DeviceTokenRequest, TraktAuthToken, TraktDeviceCode
from utils.api.errors import (
    InvalidParamsError,
    InvalidRequestError,
    MCPError,
    handle_api_errors,
)

from ..base import BaseClient
from . import storage

logger = logging.getLogger(__name__)


class AuthClient(BaseClient):
    """Client for handling Trakt authentication."""

    def __init__(self):
        """Initialize the authentication client."""
        super().__init__()
        # Guards all mutations to self.auth_token / self.headers["Authorization"].
        # Used by both clear_auth_token (sync) and refresh_access_token (async,
        # but never held across an await) to prevent interleaved writes.
        self._token_lock: threading.Lock = threading.Lock()
        self._refresh_lock: asyncio.Lock = asyncio.Lock()
        # Try to load auth token if exists
        self.auth_token: TraktAuthToken | None = self._load_auth_token()
        if self.auth_token:
            self._update_headers_with_token()

    def _load_auth_token(self) -> TraktAuthToken | None:
        """Load authentication token from Neon."""
        return storage.load_token()

    def _save_auth_token(self, token: TraktAuthToken) -> None:
        """Save authentication token to Neon."""
        storage.save_token(token)

    def is_authenticated(self) -> bool:
        """Check if the client is authenticated."""
        if not self.auth_token:
            return False

        # Check if token is expired
        expiry = self.get_token_expiry()
        return expiry is not None and int(time.time()) < expiry

    def get_token_expiry(self) -> int | None:
        """Get the expiry timestamp of the current token."""
        if not self.auth_token:
            return None
        return self.auth_token.created_at + self.auth_token.expires_in

    @handle_api_errors
    async def get_device_code(self) -> TraktDeviceCode:
        """Get a device code for authentication.

        Returns:
            Device code response from Trakt
        """
        data = {
            "client_id": self.client_id,
        }
        return await self._post_typed_request(
            TRAKT_ENDPOINTS["device_code"], data, response_type=TraktDeviceCode
        )

    @handle_api_errors
    async def get_device_token(self, device_code: str) -> TraktAuthToken:
        """Exchange device code for an access token.

        Args:
            device_code: The device code to exchange

        Returns:
            Authentication token

        Raises:
            AppError: AuthenticationError | NetworkError | InternalError raised
                by the handle_api_errors decorator when the exchange fails.
        """
        # Validate input with Pydantic
        payload = DeviceTokenRequest.model_validate({"code": device_code})
        data = {
            "code": payload.code,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
        }

        token = await self._post_typed_request(
            TRAKT_ENDPOINTS["device_token"], data, response_type=TraktAuthToken
        )
        with self._token_lock:
            self._save_auth_token(token)
            self.auth_token = token
            self._update_headers_with_token()
        return token

    async def refresh_access_token(self) -> bool:
        """Refresh the access token using the stored refresh token.

        Exchanges the refresh_token for a new access_token via the Trakt
        OAuth token endpoint. On success, saves the new token pair to Neon.

        Thread-safe: Uses an async lock to prevent concurrent refresh attempts
        from racing and invalidating each other's tokens.

        Returns:
            True if refresh succeeded, False if refresh failed
        """
        async with self._refresh_lock:
            # Re-check after acquiring lock — another coroutine may have refreshed
            if self.is_authenticated():
                return True

            with self._token_lock:
                auth_snapshot = self.auth_token

            if not auth_snapshot or not auth_snapshot.refresh_token:
                return False

            data = {
                "refresh_token": auth_snapshot.refresh_token,
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "redirect_uri": OAUTH_REDIRECT_URI,
                "grant_type": "refresh_token",
            }

            try:
                token = await self._post_typed_request(
                    TRAKT_ENDPOINTS["token"], data, response_type=TraktAuthToken
                )
                with self._token_lock:
                    self._save_auth_token(token)
                    self.auth_token = token
                    self._update_headers_with_token()
                logger.info("Successfully refreshed access token")
                return True
            except (InvalidRequestError, InvalidParamsError):
                # Permanent auth failure (HTTP 4xx: 401 revoked, 400 invalid_grant).
                # On 401, @handle_api_errors already auto-clears via
                # _auto_clear_invalid_token; this is a safety net for other 4xx.
                logger.warning(
                    "Refresh token rejected by server, clearing stale token",
                    exc_info=True,
                )
                self.clear_auth_token()
                return False
            except (MCPError, OSError, ValueError):
                # Transient / local errors: InternalError (network/timeout),
                # OSError (Neon I/O), ValueError (validation).
                # Keep the refresh token so the next attempt can succeed.
                logger.warning(
                    "Failed to refresh access token (transient"
                    + " error), keeping refresh token for next attempt",
                    exc_info=True,
                )
                return False

    async def ensure_authenticated(self) -> bool:
        """Ensure the client is authenticated, refreshing the token if needed.

        Checks authentication status and attempts a token refresh when the
        access token has expired but a refresh token is available.

        Returns:
            True if authenticated (possibly after refresh), False otherwise
        """
        if self.is_authenticated():
            return True

        # Token exists but expired — try refreshing
        if self.auth_token and self.auth_token.refresh_token:
            return await self.refresh_access_token()

        return False

    def clear_auth_token(self) -> bool:
        """Clear the stored authentication token.

        Thread-safe: Uses a lock to prevent race conditions when multiple
        concurrent 401 responses trigger token clearing.

        Returns:
            True if token was cleared, False if no token existed or already cleared
        """
        with self._token_lock:
            # Early exit if already cleared by another concurrent call
            if self.auth_token is None:
                return False

            # Always clear in-memory state first
            # (handles case where the Neon row was deleted externally)
            self.auth_token = None
            if "Authorization" in self.headers:
                del self.headers["Authorization"]

            try:
                storage.clear_token()
            except Exception:
                logger.warning(
                    "Failed to clear auth token in Neon; orphaned row may remain",
                    exc_info=True,
                )

            logger.debug("Cleared authentication token and Authorization header")
            return True
