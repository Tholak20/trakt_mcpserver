/**
 * Domaine "checkin" — 1 tool. Sortie JSON structuré (pas de formatage Markdown).
 * Endpoint AUTHENTIFIÉ : POST /checkin écrit sur le compte de l'utilisateur.
 * Portage de server/checkin/tools.py + client/checkin/client.py.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TraktClient } from "./client";

const seasonField = z.number().int().describe("Season number (e.g., 1, 2, 3)");
const episodeField = z
  .number()
  .int()
  .describe("Episode number (e.g., 1, 2, 3)");
const showIdField = z
  .string()
  .optional()
  .describe(
    "Trakt ID, Trakt slug, or IMDB ID (e.g., '1388', 'breaking-bad', 'tt0903747'). Provide either show_id OR show_title.",
  );
const showTitleField = z
  .string()
  .optional()
  .describe(
    "Title of the show (e.g., 'Breaking Bad'). Provide either show_title OR show_id.",
  );
const showYearField = z
  .number()
  .int()
  .optional()
  .describe(
    "Year the show first aired (e.g., 2008). Helps disambiguate shows with the same title.",
  );
const messageField = z
  .string()
  .default("")
  .describe(
    "Optional message to share on connected social networks. If not provided, uses the user's default watching message.",
  );
const shareTwitterField = z
  .boolean()
  .default(false)
  .describe(
    "Share this check-in on Twitter. Overrides user's default sharing setting.",
  );
const shareMastodonField = z
  .boolean()
  .default(false)
  .describe(
    "Share this check-in on Mastodon. Overrides user's default sharing setting.",
  );
const shareTumblrField = z
  .boolean()
  .default(false)
  .describe(
    "Share this check-in on Tumblr. Overrides user's default sharing setting.",
  );

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerCheckinTools(server: McpServer, client: TraktClient) {
  server.tool(
    "checkin_to_show",
    "Check in to a TV show episode you're currently watching on Trakt",
    {
      season: seasonField,
      episode: episodeField,
      show_id: showIdField,
      show_title: showTitleField,
      show_year: showYearField,
      message: messageField,
      share_twitter: shareTwitterField,
      share_mastodon: shareMastodonField,
      share_tumblr: shareTumblrField,
    },
    async ({
      season,
      episode,
      show_id,
      show_title,
      show_year,
      message,
      share_twitter,
      share_mastodon,
      share_tumblr,
    }) => {
      if (!show_id && !show_title) {
        throw new Error("Either show_id or show_title must be provided");
      }

      // Données du show : base = { title } si titre fourni, sinon { ids: {} }.
      const showData: Record<string, unknown> = show_title
        ? { title: show_title }
        : { ids: {} };

      if (show_id) {
        if (!("ids" in showData)) showData.ids = {};
        (showData.ids as Record<string, unknown>).trakt = show_id;
      }
      if (show_year) showData.year = show_year;

      // Corps POST : { episode: { season, number }, show: {...} } (+ message, sharing).
      const body: Record<string, unknown> = {
        episode: { season, number: episode },
        show: showData,
      };

      if (message) body.message = message;
      if (share_twitter || share_mastodon || share_tumblr) {
        body.sharing = {
          twitter: share_twitter,
          mastodon: share_mastodon,
          tumblr: share_tumblr,
        };
      }

      return json(await client.post("checkin", body, { authenticated: true }));
    },
  );
}
