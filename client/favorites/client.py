"""Client for Trakt user favorites API."""

from client.auth import AuthClient
from utils.api.error_types import AuthenticationRequiredError


class UserFavoritesClient(AuthClient):
    """Client for fetching authenticated user's personal favorites."""

    async def get_user_favorites(self, item_type: str | None = None) -> list:
        if not await self.ensure_authenticated():
            raise AuthenticationRequiredError(action="fetch user favorites")
        path = "/users/me/favorites"
        if item_type:
            path += f"/{item_type}"
        return await self._make_list_request(path)
