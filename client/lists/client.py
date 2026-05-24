"""Client for Trakt user lists API."""

from client.base import BaseClient


class UserListsClient(BaseClient):
    """Client for fetching authenticated user's personal lists."""

    async def get_user_lists(self) -> list:
        return await self._make_list_request("/users/me/lists")

    async def get_user_list_items(
        self, list_id: str, item_type: str | None = None
    ) -> list:
        path = f"/users/me/lists/{list_id}/items"
        if item_type:
            path += f"/{item_type}"
        return await self._make_list_request(path)
