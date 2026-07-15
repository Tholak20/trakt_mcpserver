/**
 * Domaine "comments" — 6 tools. Sortie JSON structuré (pas de formatage Markdown).
 * Endpoints publics (trakt-api-key seul), pas d'auth utilisateur requise
 * → tous les appels client passent authenticated:false.
 *
 * Portage TS de server/comments/tools.py + client/comments/*.py.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TraktClient } from "./client";
import { DEFAULT_LIMIT, DEFAULT_MAX_PAGES } from "./client";

// Options de tri supportées par l'API Trakt pour les commentaires.
const sortField = z
  .enum(["newest", "oldest", "likes", "replies"])
  .default("newest")
  .describe(
    "Sort order: 'newest', 'oldest', 'likes' (most liked), or 'replies' (most replies)",
  );

const commentsLimitField = z
  .number()
  .int()
  .default(DEFAULT_LIMIT)
  .describe(
    "Number of comments to return (default 10, 0=up to all when page omitted)",
  );

const repliesLimitField = z
  .number()
  .int()
  .default(DEFAULT_LIMIT)
  .describe(
    "Number of replies to return (default 10, 0=up to all when page omitted)",
  );

const pageField = z
  .number()
  .int()
  .optional()
  .describe("Page number (omit to auto-paginate)");

const maxPagesField = z
  .number()
  .int()
  .default(DEFAULT_MAX_PAGES)
  .describe("Maximum pages to fetch during auto-pagination");

// Formatage-only côté Python (masque les commentaires spoiler dans le Markdown).
// Conservé pour parité de signature ; sans effet sur la sortie JSON brute.
const showSpoilersField = z
  .boolean()
  .default(false)
  .describe("Include spoiler-tagged comments in output (default: hidden)");

const showIdField = z
  .string()
  .min(1)
  .describe(
    "Trakt ID, Trakt slug, or IMDB ID (e.g., '1388', 'breaking-bad', 'tt0903747')",
  );

const movieIdField = z
  .string()
  .min(1)
  .describe(
    "Trakt ID, Trakt slug, or IMDB ID (e.g., '120', 'the-dark-knight-2008', 'tt0468569')",
  );

const commentIdField = z
  .string()
  .min(1)
  .describe("Trakt comment ID (numeric string, e.g., '417', '12345')");

const seasonField = z
  .number()
  .int()
  .positive()
  .describe("Season number (e.g., 1, 2, 3)");
const episodeField = z
  .number()
  .int()
  .positive()
  .describe("Episode number (e.g., 1, 2, 3)");

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerCommentTools(server: McpServer, client: TraktClient) {
  server.tool(
    "fetch_movie_comments",
    "Fetch comments for a specific movie from Trakt. Supports optional pagination with 'page' parameter and safety cap 'max_pages'.",
    {
      movie_id: movieIdField,
      limit: commentsLimitField,
      show_spoilers: showSpoilersField,
      sort: sortField,
      page: pageField,
      max_pages: maxPagesField,
    },
    async ({ movie_id, limit, sort, page, max_pages }) =>
      json(
        await client.paginate("comments_movie", {
          path: { id: movie_id, sort },
          limit,
          page: page ?? null,
          maxPages: max_pages,
          authenticated: false,
        }),
      ),
  );

  server.tool(
    "fetch_show_comments",
    "Fetch comments for a specific TV show from Trakt. Supports optional pagination with 'page' parameter and safety cap 'max_pages'.",
    {
      show_id: showIdField,
      limit: commentsLimitField,
      show_spoilers: showSpoilersField,
      sort: sortField,
      page: pageField,
      max_pages: maxPagesField,
    },
    async ({ show_id, limit, sort, page, max_pages }) =>
      json(
        await client.paginate("comments_show", {
          path: { id: show_id, sort },
          limit,
          page: page ?? null,
          maxPages: max_pages,
          authenticated: false,
        }),
      ),
  );

  server.tool(
    "fetch_season_comments",
    "Fetch comments for a specific TV show season from Trakt. Supports optional pagination with 'page' parameter and safety cap 'max_pages'.",
    {
      show_id: showIdField,
      season: seasonField,
      limit: commentsLimitField,
      show_spoilers: showSpoilersField,
      sort: sortField,
      page: pageField,
      max_pages: maxPagesField,
    },
    async ({ show_id, season, limit, sort, page, max_pages }) =>
      json(
        await client.paginate("comments_season", {
          path: { id: show_id, season, sort },
          limit,
          page: page ?? null,
          maxPages: max_pages,
          authenticated: false,
        }),
      ),
  );

  server.tool(
    "fetch_episode_comments",
    "Fetch comments for a specific TV show episode from Trakt. Supports optional pagination with 'page' parameter and safety cap 'max_pages'.",
    {
      show_id: showIdField,
      season: seasonField,
      episode: episodeField,
      limit: commentsLimitField,
      show_spoilers: showSpoilersField,
      sort: sortField,
      page: pageField,
      max_pages: maxPagesField,
    },
    async ({ show_id, season, episode, limit, sort, page, max_pages }) =>
      json(
        await client.paginate("comments_episode", {
          path: { id: show_id, season, episode, sort },
          limit,
          page: page ?? null,
          maxPages: max_pages,
          authenticated: false,
        }),
      ),
  );

  server.tool(
    "fetch_comment",
    "Fetch a specific comment from Trakt",
    {
      comment_id: commentIdField,
      show_spoilers: showSpoilersField,
    },
    async ({ comment_id }) =>
      json(
        await client.get("comment", {
          path: { id: comment_id },
          authenticated: false,
        }),
      ),
  );

  server.tool(
    "fetch_comment_replies",
    "Fetch replies for a specific comment from Trakt. Supports optional pagination with 'page' parameter and safety cap 'max_pages'.",
    {
      comment_id: commentIdField,
      limit: repliesLimitField,
      show_spoilers: showSpoilersField,
      page: pageField,
      max_pages: maxPagesField,
    },
    async ({ comment_id, limit, page, max_pages }) => {
      // Réplique le tool Python : renvoie le commentaire parent ET ses réponses.
      const comment = await client.get("comment", {
        path: { id: comment_id },
        authenticated: false,
      });
      const replies = await client.paginate("comment_replies", {
        path: { id: comment_id },
        limit,
        page: page ?? null,
        maxPages: max_pages,
        authenticated: false,
      });
      return json({ comment, replies });
    },
  );
}
