/**
 * Domaine "search" — 2 tools. Sortie JSON structuré (pas de formatage Markdown).
 * Endpoints publics (trakt-api-key seul), pas d'auth utilisateur requise.
 * L'API Trakt expose /search/:type?query=... (type = show | movie).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TraktClient } from "./client";
import { DEFAULT_LIMIT } from "./client";

const queryField = z
  .string()
  .min(1)
  .max(200)
  .describe(
    "Search query text to match against title, overview, and other text fields",
  );
const limitField = z
  .number()
  .int()
  .min(0)
  .max(100)
  .default(DEFAULT_LIMIT)
  .describe(
    "Maximum results to return (default 10, 0=up to 100 when page omitted)",
  );
const pageField = z
  .number()
  .int()
  .min(1)
  .optional()
  .describe("Page number (omit to auto-paginate)");

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerSearchTools(server: McpServer, client: TraktClient) {
  server.tool(
    "search_shows",
    "Search for TV shows on Trakt by title",
    { query: queryField, limit: limitField, page: pageField },
    async ({ query, limit, page }) =>
      json(
        await client.paginate("/search/show", {
          query: { query },
          limit,
          page: page ?? null,
          authenticated: false,
        }),
      ),
  );

  server.tool(
    "search_movies",
    "Search for movies on Trakt by title",
    { query: queryField, limit: limitField, page: pageField },
    async ({ query, limit, page }) =>
      json(
        await client.paginate("/search/movie", {
          query: { query },
          limit,
          page: page ?? null,
          authenticated: false,
        }),
      ),
  );
}
