/**
 * Domaine "people" — 4 tools. Sortie JSON structuré (pas de formatage Markdown).
 * Endpoints publics (trakt-api-key seul), pas d'auth utilisateur requise.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TraktClient } from "./client";

const personIdField = z
  .string()
  .min(1)
  .describe(
    "Trakt ID, Trakt slug, or IMDB ID (e.g., '142', 'bryan-cranston', 'nm0186505')",
  );

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

export function registerPeopleTools(server: McpServer, client: TraktClient) {
  server.tool(
    "fetch_person_summary",
    "Get person details from Trakt. Default (extended=true): full biographical data including birthday, biography, social media. Basic (extended=false): name and IDs only.",
    {
      person_id: personIdField,
      extended: z
        .boolean()
        .default(true)
        .describe(
          "Return comprehensive data (True) or only title/year/IDs (False)",
        ),
    },
    async ({ person_id, extended }) =>
      json(
        await client.get("person_summary", {
          path: { id: person_id },
          query: extended ? { extended: "full" } : undefined,
          authenticated: false,
        }),
      ),
  );

  server.tool(
    "fetch_person_movies",
    "Get all movie credits for a person from Trakt. Returns cast roles and crew positions grouped by department.",
    { person_id: personIdField },
    async ({ person_id }) =>
      json(
        await client.get("person_movies", {
          path: { id: person_id },
          authenticated: false,
        }),
      ),
  );

  server.tool(
    "fetch_person_shows",
    "Get all show credits for a person from Trakt. Returns cast roles with episode counts and crew positions grouped by department.",
    { person_id: personIdField },
    async ({ person_id }) =>
      json(
        await client.get("person_shows", {
          path: { id: person_id },
          authenticated: false,
        }),
      ),
  );

  server.tool(
    "fetch_person_lists",
    "Get lists containing a specific person from Trakt. Returns personal or official lists sorted by popularity, likes, or other criteria.",
    { person_id: personIdField, list_type: listTypeField, sort: listSortField },
    async ({ person_id, list_type, sort }) =>
      json(
        await client.paginate("person_lists", {
          path: { id: person_id, type: list_type, sort },
          authenticated: false,
        }),
      ),
  );
}
