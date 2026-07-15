/**
 * Domaine "favorites" — 1 tool. Sortie JSON structuré (pas de formatage Markdown).
 * AUTHENTIFIÉ : renvoie les favoris personnels de l'utilisateur → authenticated: true.
 *
 * NOTE : l'endpoint utilise le username en dur "Tolak" (/users/Tolak/favorites),
 * portage exact du client Python (client/favorites/client.py). Un bug documenté a
 * montré que /users/me/favorites renvoyait [] — d'où le username explicite.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TraktClient } from "./client";

// Username en dur, identique au client Python (/users/Tolak/favorites).
const FAVORITES_USER = "Tolak";

const itemTypeField = z
  .enum(["movies", "shows"])
  .optional()
  .describe("Filter by type, or leave empty for everything");

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerFavoriteTools(server: McpServer, client: TraktClient) {
  server.tool(
    "fetch_user_favorites",
    "Fetch the authenticated user's personal favorites on Trakt (their curated favorite movies and shows). " +
      "Requires OAuth authentication. " +
      "Use for: 'what are my favorites?', 'show my favorite movies', 'list my favorite shows', " +
      "'my Trakt favorites'. Optionally filter by item_type ('movies' or 'shows'); omit for everything.",
    { item_type: itemTypeField },
    async ({ item_type }) => {
      const path = item_type
        ? `/users/${FAVORITES_USER}/favorites/${encodeURIComponent(item_type)}`
        : `/users/${FAVORITES_USER}/favorites`;
      return json(await client.get(path, { authenticated: true }));
    },
  );
}
