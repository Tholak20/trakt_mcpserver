"""User favorites tools for the Trakt MCP server."""

from typing import Annotated, Literal

from mcp.server.fastmcp import FastMCP
from pydantic import Field

from client.favorites.client import UserFavoritesClient
from client.pool import get_client
from server.base import ToolErrors
from utils.api.errors import handle_api_errors_func


def _format_user_favorites(items: list) -> str:
    if not items:
        return "# Your Favorites\n\nNo favorites found."
    lines = ["# Your Favorites\n"]
    for entry in items:
        item_type = entry.get("type", "unknown")
        obj = entry.get(item_type, {})
        title = obj.get("title", "Unknown")
        year = obj.get("year", "")
        lines.append(f"- **{title}**{f' ({year})' if year else ''} [{item_type}]")
    return "\n".join(lines)


@handle_api_errors_func
async def fetch_user_favorites(item_type: str | None = None) -> str:
    client = get_client(UserFavoritesClient)
    result = await client.get_user_favorites(item_type)
    if isinstance(result, str):
        raise ToolErrors.handle_api_string_error(
            resource_type="user_favorites",
            resource_id="me",
            error_message=result,
            operation="fetch_user_favorites",
        )
    return _format_user_favorites(result)


def register_favorites_tools(mcp: FastMCP) -> tuple:
    """Register user favorites tools with the MCP server."""

    @mcp.tool(
        name="fetch_user_favorites",
        description=(
            "Fetch the authenticated user's personal favorites on Trakt. "
            "Requires OAuth authentication."
        ),
    )
    async def fetch_user_favorites_tool(
        item_type: Annotated[
            Literal["movies", "shows"] | None,
            Field(description="Filter by type, or leave empty for everything"),
        ] = None,
    ) -> str:
        return await fetch_user_favorites(item_type)

    return (fetch_user_favorites_tool,)
