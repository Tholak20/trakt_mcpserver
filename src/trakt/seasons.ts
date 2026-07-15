/**
 * Domaine "seasons" — 9 tools. Sortie JSON structuré (pas de formatage Markdown).
 * Endpoints publics (trakt-api-key seul), pas d'auth utilisateur requise.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TraktClient } from "./client";

const showIdField = z
  .string()
  .min(1)
  .describe(
    "Trakt ID, Trakt slug, or IMDB ID (e.g., '1388', 'breaking-bad', 'tt0903747')",
  );
const seasonField = z
  .number()
  .int()
  .gte(0)
  .describe("Season number (e.g., 1, 2, 3)");
const embedMarkdownField = z
  .boolean()
  .default(true)
  .describe(
    "Use embedded YouTube iframe markdown (True) or simple links (False)",
  );
const languageField = z
  .string()
  .default("all")
  .describe("2-character language code (e.g., 'en', 'es', 'de')");
const listTypeField = z
  .enum(["all", "personal", "official", "watchlists"])
  .default("all")
  .describe("List type filter: 'all', 'personal', 'official', 'watchlists'");
const listSortField = z
  .enum(["popular", "likes", "comments", "items", "added", "updated"])
  .default("popular")
  .describe(
    "List sort: 'popular', 'likes', 'comments', 'items', 'added', 'updated'",
  );

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerSeasonTools(server: McpServer, client: TraktClient) {
  server.tool(
    "fetch_season_info",
    "Fetch detailed information about a specific TV show season, including episode count, ratings, and air dates.",
    { show_id: showIdField, season: seasonField },
    async ({ show_id, season }) =>
      json(
        await client.get("season_info", {
          path: { id: show_id, season },
          query: { extended: "full" },
        }),
      ),
  );

  server.tool(
    "fetch_season_episodes",
    "Fetch all episodes for a specific TV show season with titles, ratings, and runtime.",
    { show_id: showIdField, season: seasonField },
    async ({ show_id, season }) =>
      json(
        await client.get("season_episodes", {
          path: { id: show_id, season },
          query: { extended: "full" },
        }),
      ),
  );

  server.tool(
    "fetch_season_ratings",
    "Fetch ratings and voting statistics for a specific TV show season.",
    { show_id: showIdField, season: seasonField },
    async ({ show_id, season }) =>
      json(
        await client.get("season_ratings", { path: { id: show_id, season } }),
      ),
  );

  server.tool(
    "fetch_season_stats",
    "Fetch engagement statistics for a specific TV show season including watchers, plays, collectors, and comments.",
    { show_id: showIdField, season: seasonField },
    async ({ show_id, season }) =>
      json(await client.get("season_stats", { path: { id: show_id, season } })),
  );

  server.tool(
    "fetch_season_people",
    "Fetch cast and crew for a specific TV show season, including character names and episode counts.",
    { show_id: showIdField, season: seasonField },
    async ({ show_id, season }) =>
      json(
        await client.get("season_people", { path: { id: show_id, season } }),
      ),
  );

  server.tool(
    "fetch_season_videos",
    "Fetch videos (trailers, recaps, etc.) for a specific TV show season. Set embed_markdown=False for simple links.",
    {
      show_id: showIdField,
      season: seasonField,
      embed_markdown: embedMarkdownField,
    },
    async ({ show_id, season }) =>
      json(
        await client.get("season_videos", { path: { id: show_id, season } }),
      ),
  );

  server.tool(
    "fetch_season_watching",
    "Fetch users currently watching a specific TV show season right now.",
    { show_id: showIdField, season: seasonField },
    async ({ show_id, season }) =>
      json(
        await client.get("season_watching", { path: { id: show_id, season } }),
      ),
  );

  server.tool(
    "fetch_season_translations",
    "Fetch translations for a specific TV show season in different languages.",
    { show_id: showIdField, season: seasonField, language: languageField },
    async ({ show_id, season, language }) =>
      json(
        await client.get("season_translations", {
          path: { id: show_id, season, language },
        }),
      ),
  );

  server.tool(
    "fetch_season_lists",
    "Fetch lists that contain a specific TV show season.",
    {
      show_id: showIdField,
      season: seasonField,
      list_type: listTypeField,
      sort: listSortField,
    },
    async ({ show_id, season, list_type, sort }) =>
      json(
        await client.get("season_lists", {
          path: { id: show_id, season, type: list_type, sort },
        }),
      ),
  );
}
