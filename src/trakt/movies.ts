/**
 * Domaine "movies" — 12 tools. Sortie JSON structuré (pas de formatage Markdown).
 * Endpoints publics (trakt-api-key seul), pas d'auth utilisateur requise.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TraktClient } from "./client";
import { DEFAULT_LIMIT } from "./client";

const limitField = z
  .number()
  .int()
  .default(DEFAULT_LIMIT)
  .describe(
    "Nombre max de résultats (0 = tout). Cappe le total si page absent.",
  );
const pageField = z
  .number()
  .int()
  .optional()
  .describe("Numéro de page. Absent = auto-pagination jusqu'à limit.");
const periodField = z
  .enum(["daily", "weekly", "monthly", "yearly", "all"])
  .default("weekly")
  .describe("Période de calcul (daily, weekly, monthly, yearly, all).");
const movieIdField = z
  .string()
  .min(1)
  .describe(
    "Trakt ID, slug, ou IMDB ID (ex : '1', 'tron-legacy-2010', 'tt1104001').",
  );

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerMovieTools(server: McpServer, client: TraktClient) {
  server.tool(
    "fetch_trending_movies",
    "Fetch trending movies from Trakt. Use page parameter for paginated results, or omit for all results.",
    { limit: limitField, page: pageField },
    async ({ limit, page }) =>
      json(
        await client.paginate("movies_trending", { limit, page: page ?? null }),
      ),
  );

  server.tool(
    "fetch_popular_movies",
    "Fetch popular movies from Trakt. Use page parameter for paginated results, or omit for all results.",
    { limit: limitField, page: pageField },
    async ({ limit, page }) =>
      json(
        await client.paginate("movies_popular", { limit, page: page ?? null }),
      ),
  );

  server.tool(
    "fetch_favorited_movies",
    "Fetch most favorited movies from Trakt. Use page parameter for paginated results, or omit for all results.",
    { limit: limitField, period: periodField, page: pageField },
    async ({ limit, period, page }) =>
      json(
        await client.paginate("movies_favorited", {
          path: { period },
          limit,
          page: page ?? null,
        }),
      ),
  );

  server.tool(
    "fetch_played_movies",
    "Fetch most played movies from Trakt. Use page parameter for paginated results, or omit for all results.",
    { limit: limitField, period: periodField, page: pageField },
    async ({ limit, period, page }) =>
      json(
        await client.paginate("movies_played", {
          path: { period },
          limit,
          page: page ?? null,
        }),
      ),
  );

  server.tool(
    "fetch_watched_movies",
    "Fetch most watched movies from Trakt. Use page parameter for paginated results, or omit for all results.",
    { limit: limitField, period: periodField, page: pageField },
    async ({ limit, period, page }) =>
      json(
        await client.paginate("movies_watched", {
          path: { period },
          limit,
          page: page ?? null,
        }),
      ),
  );

  server.tool(
    "fetch_anticipated_movies",
    "Fetch most anticipated movies from Trakt, sorted by list count. Use page parameter for paginated results, or omit for all results.",
    { limit: limitField, page: pageField },
    async ({ limit, page }) =>
      json(
        await client.paginate("movies_anticipated", {
          limit,
          page: page ?? null,
        }),
      ),
  );

  server.tool(
    "fetch_boxoffice_movies",
    "Fetch the top 10 grossing movies in the U.S. box office last weekend. Updated every Monday morning.",
    {},
    async () => json(await client.get("movies_boxoffice")),
  );

  server.tool(
    "fetch_movie_ratings",
    "Fetch ratings and voting statistics for a specific movie",
    { movie_id: movieIdField },
    async ({ movie_id }) =>
      json(await client.get("movie_ratings", { path: { id: movie_id } })),
  );

  server.tool(
    "fetch_movie_summary",
    "Get movie summary from Trakt. Default behavior (extended=true): Returns comprehensive data including production status, ratings, genres, runtime, certification, and metadata. Basic mode (extended=false): Returns only title, year, and Trakt ID.",
    { movie_id: movieIdField, extended: z.boolean().default(true) },
    async ({ movie_id, extended }) =>
      json(
        await client.get(`/movies/${encodeURIComponent(movie_id)}`, {
          query: extended ? { extended: "full" } : undefined,
        }),
      ),
  );

  server.tool(
    "fetch_movie_videos",
    "Get videos (trailers, teasers, etc.) for a movie from Trakt. Set embed_markdown=False to return simple links instead of YouTube iframes.",
    { movie_id: movieIdField, embed_markdown: z.boolean().default(true) },
    async ({ movie_id }) =>
      json(await client.get("movie_videos", { path: { id: movie_id } })),
  );

  server.tool(
    "fetch_related_movies",
    "Fetch movies related to a specific movie. Returns similar movies based on genres, themes, and viewer patterns. Use page parameter for paginated results, or omit for all results.",
    { movie_id: movieIdField, limit: limitField, page: pageField },
    async ({ movie_id, limit, page }) =>
      json(
        await client.paginate("movies_related", {
          path: { id: movie_id },
          limit,
          page: page ?? null,
        }),
      ),
  );

  server.tool(
    "fetch_movie_people",
    "Get cast and crew for a movie from Trakt. Returns cast with character names and crew grouped by department.",
    { movie_id: movieIdField },
    async ({ movie_id }) =>
      json(await client.get("movie_people", { path: { id: movie_id } })),
  );
}
