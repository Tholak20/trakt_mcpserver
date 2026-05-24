"""Client for Trakt user lists API."""

from client.auth import AuthClient
from utils.api.error_types import AuthenticationRequiredError


class UserListsClient(AuthClient):
    """Client for fetching authenticated user's personal lists."""

    async def get_user_lists(self) -> list:
        if not await self.ensure_authenticated():
            raise AuthenticationRequiredError(action="fetch user lists")
        return await self._make_list_request("/users/me/lists")

    async def get_user_list_items(
        self, list_id: str, item_type: str | None = None
    ) -> list:
        if not await self.ensure_authenticated():
            raise AuthenticationRequiredError(action="fetch user list items")
        path = f"/users/me/lists/{list_id}/items"
        if item_type:
            path += f"/{item_type}"
        return await self._make_list_request(path)
