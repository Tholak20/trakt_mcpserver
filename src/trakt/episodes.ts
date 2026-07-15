/**
 * Domaine "episodes" — 8 tools. Sortie JSON structuré (pas de formatage Markdown).
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
  .min(0)
  .describe("Season number (e.g., 1, 2, 3)");
const episodeField = z
  .number()
  .int()
  .min(1)
  .describe("Episode number (e.g., 1, 2, 3)");
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
const embedMarkdownField = z
  .boolean()
  .default(true)
  .describe(
    "Use embedded YouTube iframe markdown (True) or simple links (False)",
  );

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerEpisodeTools(server: McpServer, client: TraktClient) {
  server.tool(
    "fetch_episode_summary",
    "Fetch detailed information about a specific TV show episode, including overview, air date, runtime, and ratings.",
    { show_id: showIdField, season: seasonField, episode: episodeField },
    async ({ show_id, season, episode }) =>
      json(
        await client.get("episode_summary", {
          path: { id: show_id, season, episode },
          query: { extended: "full" },
        }),
      ),
  );

  server.tool(
    "fetch_episode_ratings",
    "Fetch ratings and voting statistics for a specific TV show episode.",
    { show_id: showIdField, season: seasonField, episode: episodeField },
    async ({ show_id, season, episode }) =>
      json(
        await client.get("episode_ratings", {
          path: { id: show_id, season, episode },
        }),
      ),
  );

  server.tool(
    "fetch_episode_stats",
    "Fetch engagement statistics for a specific TV show episode including watchers, plays, collectors, and comments.",
    { show_id: showIdField, season: seasonField, episode: episodeField },
    async ({ show_id, season, episode }) =>
      json(
        await client.get("episode_stats", {
          path: { id: show_id, season, episode },
        }),
      ),
  );

  server.tool(
    "fetch_episode_people",
    "Fetch cast and crew for a specific TV show episode, including character names and episode counts.",
    { show_id: showIdField, season: seasonField, episode: episodeField },
    async ({ show_id, season, episode }) =>
      json(
        await client.get("episode_people", {
          path: { id: show_id, season, episode },
        }),
      ),
  );

  server.tool(
    "fetch_episode_videos",
    "Fetch videos (trailers, recaps, etc.) for a specific TV show episode. Set embed_markdown=False for simple links.",
    {
      show_id: showIdField,
      season: seasonField,
      episode: episodeField,
      embed_markdown: embedMarkdownField,
    },
    async ({ show_id, season, episode }) =>
      json(
        await client.get("episode_videos", {
          path: { id: show_id, season, episode },
        }),
      ),
  );

  server.tool(
    "fetch_episode_watching",
    "Fetch users currently watching a specific TV show episode right now.",
    { show_id: showIdField, season: seasonField, episode: episodeField },
    async ({ show_id, season, episode }) =>
      json(
        await client.get("episode_watching", {
          path: { id: show_id, season, episode },
        }),
      ),
  );

  server.tool(
    "fetch_episode_translations",
    "Fetch translations for a specific TV show episode in different languages.",
    {
      show_id: showIdField,
      season: seasonField,
      episode: episodeField,
      language: languageField,
    },
    async ({ show_id, season, episode, language }) =>
      json(
        await client.get("episode_translations", {
          path: { id: show_id, season, episode, language },
        }),
      ),
  );

  server.tool(
    "fetch_episode_lists",
    "Fetch lists that contain a specific TV show episode.",
    {
      show_id: showIdField,
      season: seasonField,
      episode: episodeField,
      list_type: listTypeField,
      sort: listSortField,
    },
    async ({ show_id, season, episode, list_type, sort }) =>
      json(
        await client.get("episode_lists", {
          path: { id: show_id, season, episode, type: list_type, sort },
        }),
      ),
  );
}
