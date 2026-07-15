/**
 * Domaine "user" — 2 tools. Sortie JSON structuré (pas de formatage Markdown).
 * Endpoints AUTHENTIFIÉS (données perso de l'utilisateur) → authenticated: true.
 * Porté depuis server/user/tools.py + client/user/client.py.
 *
 * Les endpoints /sync/watched/shows et /sync/watched/movies ne sont PAS paginés
 * côté Trakt : ils renvoient la liste complète. Le `limit` est donc appliqué
 * côté client par slice (comme le Python : items[:max_items]).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TraktClient } from "./client";

// Réplique config/api/constants.py : DEFAULT_FETCH_ALL_LIMIT.
const DEFAULT_FETCH_ALL_LIMIT = 100;

// USER_LIMIT_DESCRIPTION (config/mcp/descriptions.py).
const userLimitField = z
  .number()
  .int()
  .min(0)
  .max(100)
  .default(0)
  .describe(
    `Maximum number of items to return (0=up to ${DEFAULT_FETCH_ALL_LIMIT}, default). None is treated as 0.`,
  );

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

/**
 * Applique le cap client-side (réplique effective_limit + items[:max_items]).
 * limit=0 → cappe à DEFAULT_FETCH_ALL_LIMIT ; sinon → cappe à limit.
 */
function capItems(items: unknown, limit: number): unknown[] {
  const arr = Array.isArray(items) ? items : [];
  const maxItems = limit <= 0 ? DEFAULT_FETCH_ALL_LIMIT : limit;
  return arr.slice(0, maxItems);
}

export function registerUserTools(server: McpServer, client: TraktClient) {
  server.tool(
    "fetch_user_watched_shows",
    "Fetch list of TV shows the user has watched, sorted by most recently watched. " +
      "Returns show titles with last watched date and play counts. " +
      "Use for: 'what have I been watching?', 'my recent shows', 'list my watched shows'. " +
      "For checking a specific show (e.g., 'have I seen Breaking Bad?'), " +
      "use fetch_history with history_type='shows' and item_id instead. " +
      "Requires OAuth authentication.",
    { limit: userLimitField },
    async ({ limit }) =>
      json(
        capItems(
          await client.get("user_watched_shows", { authenticated: true }),
          limit,
        ),
      ),
  );

  server.tool(
    "fetch_user_watched_movies",
    "Fetch list of movies the user has watched, sorted by most recently watched. " +
      "Returns movie titles with last watched date and play counts. " +
      "Use for: 'what movies have I watched?', 'my recent movies', 'list my watched movies'. " +
      "For checking a specific movie (e.g., 'have I seen Inception?'), " +
      "use fetch_history with history_type='movies' and item_id instead. " +
      "Requires OAuth authentication.",
    { limit: userLimitField },
    async ({ limit }) =>
      json(
        capItems(
          await client.get("user_watched_movies", { authenticated: true }),
          limit,
        ),
      ),
  );
}
