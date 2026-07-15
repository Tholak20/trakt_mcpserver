/**
 * Domaine "sync" — 9 tools (ratings, watchlist, history). Sortie JSON structuré.
 * ATTENTION : ce domaine contient des ÉCRITURES (add/remove) → tous les endpoints
 * sont AUTHENTIFIÉS (OAuth utilisateur). Chaque appel client passe authenticated: true.
 *
 * Portage TS de server/sync/tools.py + client/sync/*.py.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TraktClient } from "./client";
import { DEFAULT_LIMIT } from "./client";

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

// ---- Descriptions (portées depuis config/mcp/descriptions.py) ----
const PAGE_DESCRIPTION = "Page number (omit to auto-paginate)";
const RATING_TYPE_DESCRIPTION =
  "Type of content: 'movies', 'shows', 'seasons', or 'episodes'";
const WATCHLIST_TYPE_DESCRIPTION =
  "Type of content: 'all' (default), 'movies', 'shows', 'seasons', or 'episodes'";
const WATCHLIST_TYPE_REQUIRED_DESCRIPTION =
  "Type of content: 'movies', 'shows', 'seasons', or 'episodes'";
const WATCHLIST_SORT_BY_DESCRIPTION =
  "Field to sort by: 'rank' (default), 'added', 'title', 'released', 'runtime', 'popularity', 'percentage', 'votes'";
const SORT_DIRECTION_DESCRIPTION =
  "Sort direction: 'asc' (ascending) or 'desc' (descending)";
const RATING_FILTER_DESCRIPTION = "Filter by specific rating (1-10)";
const RATING_ITEMS_DESCRIPTION =
  "List of items to rate. Each item must include a 'rating' (1-10) and either an identifier (trakt_id, slug, imdb_id, tmdb_id, tvdb_id) or both 'title' and 'year'";
const RATING_REMOVE_ITEMS_DESCRIPTION =
  "List of items to remove ratings from. Each item must include either an identifier (trakt_id, slug, imdb_id, tmdb_id, tvdb_id) or both 'title' and 'year'";
const WATCHLIST_ITEMS_DESCRIPTION =
  "List of items to add to watchlist. Each item must include either an identifier (trakt_id, slug, imdb_id, tmdb_id, tvdb_id) or both 'title' and 'year'. Optional 'notes' field (VIP only, 500 char max)";
const WATCHLIST_REMOVE_ITEMS_DESCRIPTION =
  "List of items to remove from watchlist. Each item must include either an identifier (trakt_id, slug, imdb_id, tmdb_id, tvdb_id) or both 'title' and 'year'";
const HISTORY_TYPE_DESCRIPTION =
  "Type of content: 'movies', 'shows', 'seasons', or 'episodes'";
const HISTORY_QUERY_TYPE_DESCRIPTION =
  "Content type to filter history: 'movies', 'shows', 'seasons', or 'episodes'. Required when querying a specific item.";
const HISTORY_ITEM_ID_DESCRIPTION =
  "Trakt ID (numeric) of the specific item to check. Examples: '1388', '5106'. Requires history_type to be specified.";
const HISTORY_START_AT_DESCRIPTION =
  "Filter watches after this date (ISO 8601, e.g., '2024-01-01T00:00:00.000Z')";
const HISTORY_END_AT_DESCRIPTION =
  "Filter watches before this date (ISO 8601, e.g., '2024-12-31T23:59:59.000Z')";
const HISTORY_ITEMS_DESCRIPTION =
  "List of items to add to history. Each item must include either an identifier (trakt_id, slug, imdb_id, tmdb_id, tvdb_id) or both 'title' and 'year'. Optional 'watched_at' (ISO 8601 timestamp)";
const HISTORY_REMOVE_ITEMS_DESCRIPTION =
  "List of items to remove from history. Each item must include either an identifier (trakt_id, slug, imdb_id, tmdb_id, tvdb_id) or both 'title' and 'year'";

// ---- Champs zod partagés ----
const contentType = z.enum(["movies", "shows", "seasons", "episodes"]);
const watchlistType = z.enum(["all", "movies", "shows", "seasons", "episodes"]);
const watchlistSortField = z.enum([
  "rank",
  "added",
  "title",
  "released",
  "runtime",
  "popularity",
  "percentage",
  "votes",
]);
const pageField = z.number().int().min(1).optional().describe(PAGE_DESCRIPTION);

/**
 * Identifiant d'item Trakt (réplique IdentifierValidatorMixin). Chaque item doit
 * fournir soit un identifiant (trakt_id/slug/imdb_id/tmdb_id/tvdb_id), soit
 * title + year. Les identifiants numériques sont passés en string comme côté Python.
 */
const identifierShape = {
  trakt_id: z.string().min(1).optional().describe("Trakt ID (numeric string)"),
  slug: z.string().min(1).optional().describe("Trakt slug"),
  imdb_id: z
    .string()
    .min(1)
    .optional()
    .describe("IMDB ID (format: 'tt' + digits)"),
  tmdb_id: z.string().min(1).optional().describe("TMDB ID (numeric string)"),
  tvdb_id: z
    .string()
    .min(1)
    .optional()
    .describe("TVDB ID (numeric string, for TV shows only)"),
  title: z
    .string()
    .min(1)
    .optional()
    .describe("Title (use with 'year' instead of identifiers)"),
  year: z
    .number()
    .int()
    .optional()
    .describe("Release year (use with 'title' instead of identifiers)"),
};

type IdentifierItem = {
  trakt_id?: string;
  slug?: string;
  imdb_id?: string;
  tmdb_id?: string;
  tvdb_id?: string;
  title?: string;
  year?: number;
};

/** Réplique build_ids_dict() : convertit les champs d'ID au format API Trakt. */
function buildIdsDict(item: IdentifierItem): Record<string, string | number> {
  const ids: Record<string, string | number> = {};
  if (item.trakt_id) ids.trakt = Number(item.trakt_id);
  if (item.slug) ids.slug = item.slug;
  if (item.imdb_id) ids.imdb = item.imdb_id;
  if (item.tmdb_id) ids.tmdb = Number(item.tmdb_id);
  if (item.tvdb_id) ids.tvdb = Number(item.tvdb_id);
  return ids;
}

/** Construit le corps { ids?, title?, year?, ...extra } d'un item sync (exclude_none). */
function buildSyncItem(
  item: IdentifierItem,
  extra: Record<string, unknown> = {},
  { requireIds = false }: { requireIds?: boolean } = {},
): Record<string, unknown> {
  const ids = buildIdsDict(item);
  const out: Record<string, unknown> = {};
  // History : ids omis si vide (title/year seuls suffisent). Ratings/watchlist :
  // build_ids_dict renvoie toujours quelque chose car un ID ou title+year est requis ;
  // on n'ajoute ids que s'il est non vide, comme le exclude_none de Pydantic.
  if (requireIds || Object.keys(ids).length > 0) out.ids = ids;
  if (item.title) out.title = item.title;
  if (item.year) out.year = item.year;
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

export function registerSyncTools(server: McpServer, client: TraktClient) {
  // ---------------------------------------------------------------- Ratings
  server.tool(
    "fetch_user_ratings",
    "Fetch the authenticated user's personal ratings from Trakt. Supports optional pagination with 'page' parameter. Requires OAuth authentication.",
    {
      rating_type: contentType
        .default("movies")
        .describe(RATING_TYPE_DESCRIPTION),
      rating: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe(RATING_FILTER_DESCRIPTION),
      page: pageField,
    },
    async ({ rating_type, rating, page }) => {
      // sync_ratings_get (/sync/ratings/:type/:rating) si un rating est filtré,
      // sinon sync_ratings_get_type (/sync/ratings/:type).
      const key = rating != null ? "sync_ratings_get" : "sync_ratings_get_type";
      const path: Record<string, string | number> = { type: rating_type };
      if (rating != null) path.rating = rating;
      return json(
        await client.paginate(key, {
          path,
          page: page ?? null,
          limit: DEFAULT_LIMIT,
          authenticated: true,
        }),
      );
    },
  );

  server.tool(
    "add_user_ratings",
    "Add new ratings for the authenticated user. Requires OAuth authentication.",
    {
      rating_type: contentType.describe(RATING_TYPE_DESCRIPTION),
      items: z
        .array(
          z.object({
            ...identifierShape,
            rating: z
              .number()
              .int()
              .min(1)
              .max(10)
              .describe("Rating from 1 to 10"),
          }),
        )
        .min(1)
        .describe(RATING_ITEMS_DESCRIPTION),
    },
    async ({ rating_type, items }) => {
      const body = {
        [rating_type]: items.map((it) =>
          buildSyncItem(it, { rating: it.rating }),
        ),
      };
      return json(
        await client.post("sync_ratings_add", body, { authenticated: true }),
      );
    },
  );

  server.tool(
    "remove_user_ratings",
    "Remove ratings for the authenticated user. Requires OAuth authentication.",
    {
      rating_type: contentType.describe(RATING_TYPE_DESCRIPTION),
      items: z
        .array(z.object({ ...identifierShape }))
        .min(1)
        .describe(RATING_REMOVE_ITEMS_DESCRIPTION),
    },
    async ({ rating_type, items }) => {
      // Suppression : pas de valeur de rating dans le corps.
      const body = { [rating_type]: items.map((it) => buildSyncItem(it)) };
      return json(
        await client.post("sync_ratings_remove", body, { authenticated: true }),
      );
    },
  );

  // -------------------------------------------------------------- Watchlist
  server.tool(
    "fetch_user_watchlist",
    "Fetch the authenticated user's watchlist from Trakt. Supports optional pagination with 'page' parameter and sorting options. Requires OAuth authentication.",
    {
      watchlist_type: watchlistType
        .default("all")
        .describe(WATCHLIST_TYPE_DESCRIPTION),
      sort_by: watchlistSortField
        .default("rank")
        .describe(WATCHLIST_SORT_BY_DESCRIPTION),
      sort_how: z
        .enum(["asc", "desc"])
        .default("asc")
        .describe(SORT_DIRECTION_DESCRIPTION),
      page: pageField,
    },
    async ({ watchlist_type, sort_by, sort_how, page }) => {
      // Sélection d'endpoint identique au client Python :
      //  - all + rank + asc  → sync_watchlist_get_all (/sync/watchlist)
      //  - rank + asc        → sync_watchlist_get_type (/sync/watchlist/:type)
      //  - sinon             → sync_watchlist_get (/sync/watchlist/:type/:sort_by/:sort_how)
      let key: string;
      let path: Record<string, string | number> | undefined;
      if (
        watchlist_type === "all" &&
        sort_by === "rank" &&
        sort_how === "asc"
      ) {
        key = "sync_watchlist_get_all";
        path = undefined;
      } else if (sort_by === "rank" && sort_how === "asc") {
        key = "sync_watchlist_get_type";
        path = { type: watchlist_type };
      } else {
        key = "sync_watchlist_get";
        path = { type: watchlist_type, sort_by, sort_how };
      }
      return json(
        await client.paginate(key, {
          path,
          page: page ?? null,
          limit: DEFAULT_LIMIT,
          authenticated: true,
        }),
      );
    },
  );

  server.tool(
    "add_user_watchlist",
    "Add items to the authenticated user's watchlist. Supports optional notes (VIP only, 500 character limit). Requires OAuth authentication.",
    {
      watchlist_type: contentType.describe(WATCHLIST_TYPE_REQUIRED_DESCRIPTION),
      items: z
        .array(
          z.object({
            ...identifierShape,
            notes: z
              .string()
              .max(500)
              .optional()
              .describe("Optional notes (VIP only, 500 char max)"),
          }),
        )
        .min(1)
        .describe(WATCHLIST_ITEMS_DESCRIPTION),
    },
    async ({ watchlist_type, items }) => {
      const body = {
        [watchlist_type]: items.map((it) =>
          buildSyncItem(it, { notes: it.notes?.trim() || undefined }),
        ),
      };
      return json(
        await client.post("sync_watchlist_add", body, { authenticated: true }),
      );
    },
  );

  server.tool(
    "remove_user_watchlist",
    "Remove items from the authenticated user's watchlist. Requires OAuth authentication.",
    {
      watchlist_type: contentType.describe(WATCHLIST_TYPE_REQUIRED_DESCRIPTION),
      items: z
        .array(z.object({ ...identifierShape }))
        .min(1)
        .describe(WATCHLIST_REMOVE_ITEMS_DESCRIPTION),
    },
    async ({ watchlist_type, items }) => {
      // Suppression : pas de notes dans le corps.
      const body = { [watchlist_type]: items.map((it) => buildSyncItem(it)) };
      return json(
        await client.post("sync_watchlist_remove", body, {
          authenticated: true,
        }),
      );
    },
  );

  // ---------------------------------------------------------------- History
  server.tool(
    "fetch_history",
    "Check if a movie or show has been watched, or browse watch history. For 'Have I seen [movie]?': provide history_type='movies' and item_id. Returns watch dates and count. Empty result means not watched. Supports optional pagination with 'page' parameter. Requires OAuth authentication.",
    {
      history_type: contentType
        .optional()
        .describe(HISTORY_QUERY_TYPE_DESCRIPTION),
      item_id: z.string().optional().describe(HISTORY_ITEM_ID_DESCRIPTION),
      start_at: z.string().optional().describe(HISTORY_START_AT_DESCRIPTION),
      end_at: z.string().optional().describe(HISTORY_END_AT_DESCRIPTION),
      page: pageField,
    },
    async ({ history_type, item_id, start_at, end_at, page }) => {
      // Sélection d'endpoint :
      //  - type + item_id → sync_history_get (/sync/history/:type/:item_id)
      //  - type seul      → sync_history_get_type (/sync/history/:type)
      //  - rien           → sync_history_add (/sync/history)
      let key: string;
      let path: Record<string, string | number> | undefined;
      if (history_type && item_id) {
        key = "sync_history_get";
        path = { type: history_type, item_id };
      } else if (history_type) {
        key = "sync_history_get_type";
        path = { type: history_type };
      } else {
        key = "sync_history_add";
        path = undefined;
      }
      const query: Record<string, string | number | undefined> = {};
      if (start_at) query.start_at = start_at;
      if (end_at) query.end_at = end_at;
      return json(
        await client.paginate(key, {
          path,
          query,
          page: page ?? null,
          limit: DEFAULT_LIMIT,
          authenticated: true,
        }),
      );
    },
  );

  server.tool(
    "add_to_history",
    "Add items to watch history. Marks movies, shows, seasons, or episodes as watched. Optionally specify when they were watched. Requires OAuth authentication.",
    {
      history_type: contentType.describe(HISTORY_TYPE_DESCRIPTION),
      items: z
        .array(
          z.object({
            ...identifierShape,
            watched_at: z
              .string()
              .optional()
              .describe("ISO 8601 timestamp when watched"),
          }),
        )
        .min(1)
        .describe(HISTORY_ITEMS_DESCRIPTION),
    },
    async ({ history_type, items }) => {
      // NB : le client Python découpe les shows par saison (batch) pour éviter les
      // timeouts 504 de Trakt sur les séries volumineuses. On envoie ici la requête
      // directement (comportement API standard) — cf. incertitude signalée.
      const body = {
        [history_type]: items.map((it) =>
          buildSyncItem(it, { watched_at: it.watched_at }),
        ),
      };
      return json(
        await client.post("sync_history_add", body, { authenticated: true }),
      );
    },
  );

  server.tool(
    "remove_from_history",
    "Remove items from watch history. Removes movies, shows, seasons, or episodes from your watched history. Requires OAuth authentication.",
    {
      history_type: contentType.describe(HISTORY_TYPE_DESCRIPTION),
      items: z
        .array(z.object({ ...identifierShape }))
        .min(1)
        .describe(HISTORY_REMOVE_ITEMS_DESCRIPTION),
    },
    async ({ history_type, items }) => {
      const body = { [history_type]: items.map((it) => buildSyncItem(it)) };
      return json(
        await client.post("sync_history_remove", body, {
          authenticated: true,
        }),
      );
    },
  );
}
