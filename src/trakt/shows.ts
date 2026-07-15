/**
 * Domaine "shows" — 12 tools. Sortie JSON structuré (pas de formatage Markdown).
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
const showIdField = z
  .string()
  .min(1)
  .describe(
    "Trakt ID, slug, ou IMDB ID (ex : '1388', 'breaking-bad', 'tt0903747').",
  );

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerShowTools(server: McpServer, client: TraktClient) {
  server.tool(
    "fetch_trending_shows",
    "Fetch trending TV shows from Trakt. Use page for paginated results, or omit for all results.",
    { limit: limitField, page: pageField },
    async ({ limit, page }) =>
      json(
        await client.paginate("shows_trending", { limit, page: page ?? null }),
      ),
  );

  server.tool(
    "fetch_popular_shows",
    "Fetch popular TV shows from Trakt. Use page for paginated results, or omit for all results.",
    { limit: limitField, page: pageField },
    async ({ limit, page }) =>
      json(
        await client.paginate("shows_popular", { limit, page: page ?? null }),
      ),
  );

  server.tool(
    "fetch_favorited_shows",
    "Fetch most favorited TV shows from Trakt over a period.",
    { limit: limitField, period: periodField, page: pageField },
    async ({ limit, period, page }) =>
      json(
        await client.paginate("shows_favorited", {
          path: { period },
          limit,
          page: page ?? null,
        }),
      ),
  );

  server.tool(
    "fetch_played_shows",
    "Fetch most played TV shows from Trakt over a period.",
    { limit: limitField, period: periodField, page: pageField },
    async ({ limit, period, page }) =>
      json(
        await client.paginate("shows_played", {
          path: { period },
          limit,
          page: page ?? null,
        }),
      ),
  );

  server.tool(
    "fetch_watched_shows",
    "Fetch most watched TV shows from Trakt over a period.",
    { limit: limitField, period: periodField, page: pageField },
    async ({ limit, period, page }) =>
      json(
        await client.paginate("shows_watched", {
          path: { period },
          limit,
          page: page ?? null,
        }),
      ),
  );

  server.tool(
    "fetch_anticipated_shows",
    "Fetch most anticipated TV shows from Trakt, sorted by list count.",
    { limit: limitField, page: pageField },
    async ({ limit, page }) =>
      json(
        await client.paginate("shows_anticipated", {
          limit,
          page: page ?? null,
        }),
      ),
  );

  server.tool(
    "fetch_show_ratings",
    "Fetch ratings and voting statistics for a specific TV show.",
    { show_id: showIdField },
    async ({ show_id }) =>
      json(await client.get("show_ratings", { path: { id: show_id } })),
  );

  server.tool(
    "fetch_show_summary",
    "Get TV show summary from Trakt. extended=true (défaut) renvoie les données complètes (air times, statut, genres, network…). extended=false : titre, année, ID seulement.",
    { show_id: showIdField, extended: z.boolean().default(true) },
    async ({ show_id, extended }) =>
      json(
        await client.get(`/shows/${encodeURIComponent(show_id)}`, {
          query: extended ? { extended: "full" } : undefined,
        }),
      ),
  );

  server.tool(
    "fetch_show_videos",
    "Get videos (trailers, teasers…) for a show from Trakt.",
    { show_id: showIdField, embed_markdown: z.boolean().default(true) },
    async ({ show_id }) =>
      json(await client.get("show_videos", { path: { id: show_id } })),
  );

  server.tool(
    "fetch_related_shows",
    "Fetch TV shows related to a specific show (similar genres, themes, viewer patterns).",
    { show_id: showIdField, limit: limitField, page: pageField },
    async ({ show_id, limit, page }) =>
      json(
        await client.paginate("shows_related", {
          path: { id: show_id },
          limit,
          page: page ?? null,
        }),
      ),
  );

  server.tool(
    "fetch_show_seasons",
    "Fetch all seasons for a TV show from Trakt (episode counts, ratings per season).",
    { show_id: showIdField },
    async ({ show_id }) =>
      json(
        await client.get("show_seasons", {
          path: { id: show_id },
          query: { extended: "full" },
        }),
      ),
  );

  server.tool(
    "fetch_show_people",
    "Get cast and crew for a TV show from Trakt. include_guest_stars=true ajoute les guest stars (beaucoup de données).",
    { show_id: showIdField, include_guest_stars: z.boolean().default(false) },
    async ({ show_id, include_guest_stars }) =>
      json(
        await client.get("show_people", {
          path: { id: show_id },
          query: include_guest_stars ? { extended: "guest_stars" } : undefined,
        }),
      ),
  );
}
