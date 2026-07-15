/**
 * Domaine "lists" — 2 tools. Sortie JSON structuré (pas de formatage Markdown).
 * Endpoints authentifiés (listes personnelles de l'utilisateur via OAuth) :
 * /users/me/lists et /users/me/lists/:list_id/items[/:item_type].
 * Ces chemins ne sont pas dans endpoints.ts → chemins littéraux avec encodeURIComponent.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TraktClient } from "./client";

const listIdField = z
  .string()
  .min(1)
  .describe("List slug from fetch_user_lists");

const itemTypeField = z
  .enum(["movies", "shows", "seasons", "episodes", "people"])
  .optional()
  .describe("Filter by type, or leave empty for everything");

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerListTools(server: McpServer, client: TraktClient) {
  server.tool(
    "fetch_user_lists",
    "Fetch all personal lists for the authenticated user on Trakt. Returns list names, IDs (slugs), and item counts. Use the slug with fetch_user_list_items to see the contents. Requires OAuth authentication.",
    {},
    async () =>
      json(await client.get("/users/me/lists", { authenticated: true })),
  );

  server.tool(
    "fetch_user_list_items",
    "Fetch items in a specific personal Trakt list. Use the list slug from fetch_user_lists as list_id. Requires OAuth authentication.",
    { list_id: listIdField, item_type: itemTypeField },
    async ({ list_id, item_type }) => {
      let path = `/users/me/lists/${encodeURIComponent(list_id)}/items`;
      if (item_type) path += `/${encodeURIComponent(item_type)}`;
      return json(await client.get(path, { authenticated: true }));
    },
  );
}
