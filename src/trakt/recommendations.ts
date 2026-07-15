/**
 * Domaine "recommendations" — 6 tools. Sortie JSON structuré (pas de Markdown).
 * Endpoints AUTHENTIFIÉS : recommandations personnelles → authenticated: true partout.
 *
 * L'API recommandations de Trakt ne pagine pas : on utilise client.get avec le
 * paramètre limit (max 100) pour lister, client.del pour cacher (DELETE .../:id),
 * client.post pour ré-afficher (POST /users/hidden/recommendations/remove).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TraktClient } from "./client";
import { DEFAULT_LIMIT } from "./client";

const limitField = z
  .number()
  .int()
  .min(1)
  .max(100)
  .default(DEFAULT_LIMIT)
  .describe(
    `Number of recommendations to return (1-100, default ${DEFAULT_LIMIT})`,
  );
const ignoreCollectedField = z
  .boolean()
  .default(true)
  .describe("Filter out items the user has already collected");
const ignoreWatchlistedField = z
  .boolean()
  .default(true)
  .describe("Filter out items the user has already watchlisted");
const movieIdField = z
  .string()
  .min(1)
  .describe(
    "Trakt ID, Trakt slug, or IMDB ID (e.g., '120', 'the-dark-knight-2008', 'tt0468569')",
  );
const showIdField = z
  .string()
  .min(1)
  .describe(
    "Trakt ID, Trakt slug, or IMDB ID (e.g., '1388', 'breaking-bad', 'tt0903747')",
  );

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

/**
 * Réplique utils/api/id_helpers.build_trakt_id_object : construit l'objet ID
 * attendu par le POST unhide (ex : {"movies": [{"ids": {"trakt": 123}}]}).
 */
function buildTraktIdObject(itemId: string, itemType: "movies" | "shows") {
  let idObj: Record<string, string | number>;
  if (/^\d+$/.test(itemId)) {
    idObj = { trakt: Number(itemId) };
  } else if (itemId.startsWith("tt")) {
    idObj = { imdb: itemId };
  } else {
    idObj = { slug: itemId };
  }
  return { [itemType]: [{ ids: idObj }] };
}

export function registerRecommendationTools(
  server: McpServer,
  client: TraktClient,
) {
  server.tool(
    "fetch_movie_recommendations",
    "Fetch personalized movie recommendations from Trakt based on your viewing history. Requires OAuth authentication. Use limit parameter (max 100) to control number of results.",
    {
      limit: limitField,
      ignore_collected: ignoreCollectedField,
      ignore_watchlisted: ignoreWatchlistedField,
    },
    async ({ limit, ignore_collected, ignore_watchlisted }) =>
      json(
        await client.get("recommendations_movies", {
          query: {
            limit,
            ignore_collected: ignore_collected ? "true" : undefined,
            ignore_watchlisted: ignore_watchlisted ? "true" : undefined,
          },
          authenticated: true,
        }),
      ),
  );

  server.tool(
    "fetch_show_recommendations",
    "Fetch personalized TV show recommendations from Trakt based on your viewing history. Requires OAuth authentication. Use limit parameter (max 100) to control number of results.",
    {
      limit: limitField,
      ignore_collected: ignoreCollectedField,
      ignore_watchlisted: ignoreWatchlistedField,
    },
    async ({ limit, ignore_collected, ignore_watchlisted }) =>
      json(
        await client.get("recommendations_shows", {
          query: {
            limit,
            ignore_collected: ignore_collected ? "true" : undefined,
            ignore_watchlisted: ignore_watchlisted ? "true" : undefined,
          },
          authenticated: true,
        }),
      ),
  );

  server.tool(
    "hide_movie_recommendation",
    "Hide a movie from future recommendations. Requires OAuth authentication. Use Trakt ID, slug, or IMDB ID to identify the movie.",
    { movie_id: movieIdField },
    async ({ movie_id }) => {
      await client.del("hide_movie_recommendation", {
        path: { id: movie_id },
        authenticated: true,
      });
      return json({ hidden: true, type: "movie", id: movie_id });
    },
  );

  server.tool(
    "hide_show_recommendation",
    "Hide a TV show from future recommendations. Requires OAuth authentication. Use Trakt ID, slug, or IMDB ID to identify the show.",
    { show_id: showIdField },
    async ({ show_id }) => {
      await client.del("hide_show_recommendation", {
        path: { id: show_id },
        authenticated: true,
      });
      return json({ hidden: true, type: "show", id: show_id });
    },
  );

  server.tool(
    "unhide_movie_recommendation",
    "Unhide a movie to restore it in future recommendations. Requires OAuth authentication. Use Trakt ID, slug, or IMDB ID to identify the movie.",
    { movie_id: movieIdField },
    async ({ movie_id }) => {
      await client.post(
        "unhide_recommendations",
        buildTraktIdObject(movie_id, "movies"),
        { authenticated: true },
      );
      return json({ unhidden: true, type: "movie", id: movie_id });
    },
  );

  server.tool(
    "unhide_show_recommendation",
    "Unhide a TV show to restore it in future recommendations. Requires OAuth authentication. Use Trakt ID, slug, or IMDB ID to identify the show.",
    { show_id: showIdField },
    async ({ show_id }) => {
      await client.post(
        "unhide_recommendations",
        buildTraktIdObject(show_id, "shows"),
        { authenticated: true },
      );
      return json({ unhidden: true, type: "show", id: show_id });
    },
  );
}
