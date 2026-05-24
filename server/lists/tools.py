"""User list tools for the Trakt MCP server."""

from typing import Annotated, Literal

from mcp.server.fastmcp import FastMCP
from pydantic import Field

from client.lists.client import UserListsClient
from client.pool import get_client
from server.base import ToolErrors
from utils.api.errors import handle_api_errors_func


def _format_user_lists(lists: list) -> str:
    if not lists:
        return "# Your Lists\n\nNo personal lists found."
    lines = ["# Your Lists\n"]
    for lst in lists:
        name = lst.get("name", "Unknown")
        list_id = lst.get("ids", {}).get("slug") or str(lst.get("ids", {}).get("trakt", ""))
        count = lst.get("item_count", 0)
        description = lst.get("description", "")
        lines.append(f"## {name}")
        lines.append(f"- **ID**: `{list_id}`")
        lines.append(f"- **Items**: {count}")
        if description:
            lines.append(f"- **Description**: {description}")
        lines.append("")
    return "\n".join(lines)


def _format_list_items(items: list, list_id: str) -> str:
    if not items:
        return f"# List `{list_id}`\n\nNo items found."
    lines = [f"# List `{list_id}` ({len(items)} items)\n"]
    for entry in items:
        item_type = entry.get("type", "unknown")
        obj = entry.get(item_type, {})
        title = obj.get("title", "Unknown")
        year = obj.get("year", "")
        rank = entry.get("rank", "")
        prefix = f"{rank}. " if rank else "- "
        lines.append(f"{prefix}**{title}**{f' ({year})' if year else ''} [{item_type}]")
    return "\n".join(lines)


@handle_api_errors_func
async def fetch_user_lists() -> str:
    client = get_client(UserListsClient)
    result = await client.get_user_lists()
    if isinstance(result, str):
        raise ToolErrors.handle_api_string_error(
            resource_type="user_lists",
            resource_id="me",
            error_message=result,
            operation="fetch_user_lists",
        )
    return _format_user_lists(result)


@handle_api_errors_func
async def fetch_user_list_items(
    list_id: str,
    item_type: str | None = None,
) -> str:
    client = get_client(UserListsClient)
    result = await client.get_user_list_items(list_id, item_type)
    if isinstance(result, str):
        raise ToolErrors.handle_api_string_error(
            resource_type="user_list_items",
            resource_id=list_id,
            error_message=result,
            operation="fetch_user_list_items",
        )
    return _format_list_items(result, list_id)


def register_list_tools(mcp: FastMCP) -> tuple:
    """Register user list tools with the MCP server."""

    @mcp.tool(
        name="fetch_user_lists",
        description=(
            "Fetch all personal lists for the authenticated user on Trakt. "
            "Returns list names, IDs (slugs), and item counts. "
            "Use the slug with fetch_user_list_items to see the contents. "
            "Requires OAuth authentication."
        ),
    )
    async def fetch_user_lists_tool() -> str:
        return await fetch_user_lists()

    @mcp.tool(
        name="fetch_user_list_items",
        description=(
            "Fetch items in a specific personal Trakt list. "
            "Use the list slug from fetch_user_lists as list_id. "
            "Requires OAuth authentication."
        ),
    )
    async def fetch_user_list_items_tool(
        list_id: Annotated[str, Field(min_length=1, description="List slug from fetch_user_lists")],
        item_type: Annotated[
            Literal["movies", "shows", "seasons", "episodes", "people"] | None,
            Field(description="Filter by type, or leave empty for everything"),
        ] = None,
    ) -> str:
        return await fetch_user_list_items(list_id, item_type)

    return (fetch_user_lists_tool, fetch_user_list_items_tool)
