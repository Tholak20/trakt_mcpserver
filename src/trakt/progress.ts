/**
 * Domaine "progress" — 3 tools. Sortie JSON structuré (pas de formatage Markdown).
 * Endpoints AUTHENTIFIÉS (progression/playback perso) → authenticated: true partout.
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
const hiddenField = z
  .boolean()
  .default(false)
  .describe("Include hidden seasons in progress calculation (default: false)");
const specialsField = z
  .boolean()
  .default(false)
  .describe("Include specials as season 0 in progress (default: false)");
const countSpecialsField = z
  .boolean()
  .default(true)
  .describe(
    "Count specials in overall stats when specials are included (default: true)",
  );
const lastActivityField = z
  .enum(["aired", "watched"])
  .default("aired")
  .describe(
    "Calculate last/next episode based on: 'aired' (default) or 'watched'",
  );
const verboseField = z
  .boolean()
  .default(false)
  .describe(
    "Show episode-by-episode watch dates within each season (default: false)",
  );
const playbackTypeField = z
  .enum(["movies", "episodes"])
  .optional()
  .describe("Type of playback progress: 'movies', 'episodes', or omit for all");
const playbackIdField = z
  .number()
  .int()
  .gt(0)
  .describe(
    "Playback item ID to remove (from fetch_playback_progress results)",
  );

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerProgressTools(server: McpServer, client: TraktClient) {
  server.tool(
    "fetch_show_progress",
    "Check if a user has watched a specific TV show and their progress " +
      "through it. " +
      "Use this for: 'have I seen X?', 'did I finish X?', " +
      "'where am I in X?', 'what episode am I on?'. " +
      "Returns episodes watched, completion percentage, next episode to " +
      "watch, and per-season breakdown. " +
      "For listing all watched shows, use fetch_user_watched_shows instead. " +
      "Requires OAuth authentication.",
    {
      show_id: showIdField,
      hidden: hiddenField,
      specials: specialsField,
      count_specials: countSpecialsField,
      last_activity: lastActivityField,
      verbose: verboseField,
    },
    async ({ show_id, hidden, specials, count_specials, last_activity }) =>
      json(
        await client.get("show_progress_watched", {
          path: { id: show_id },
          query: {
            hidden: String(hidden),
            specials: String(specials),
            count_specials: String(count_specials),
            last_activity,
          },
          authenticated: true,
        }),
      ),
  );

  server.tool(
    "fetch_playback_progress",
    "Fetch paused playback progress items. Shows movies and episodes " +
      "that were paused during playback with their progress percentage. " +
      "Requires OAuth authentication.",
    { playback_type: playbackTypeField },
    async ({ playback_type }) =>
      json(
        playback_type
          ? await client.get("sync_playback_type", {
              path: { type: playback_type },
              authenticated: true,
            })
          : await client.get("sync_playback", { authenticated: true }),
      ),
  );

  server.tool(
    "remove_playback_item",
    "Remove a paused playback progress item. Use the ID from " +
      "fetch_playback_progress results. Requires OAuth authentication.",
    { playback_id: playbackIdField },
    async ({ playback_id }) => {
      await client.del("sync_playback_remove", {
        path: { id: playback_id },
        authenticated: true,
      });
      return json({
        message: `Successfully removed playback item with ID ${playback_id}.`,
      });
    },
  );
}
