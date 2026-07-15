import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { GitHubHandler } from "./github-handler";
import { checkAuthStatus, clearAuth, startDeviceAuth } from "./trakt/auth";
import { TraktClient } from "./trakt/client";
import { registerCheckinTools } from "./trakt/checkin";
import { registerCommentTools } from "./trakt/comments";
import { registerEpisodeTools } from "./trakt/episodes";
import { registerFavoriteTools } from "./trakt/favorites";
import { registerListTools } from "./trakt/lists";
import { registerMovieTools } from "./trakt/movies";
import { registerPeopleTools } from "./trakt/people";
import { registerProgressTools } from "./trakt/progress";
import { registerRecommendationTools } from "./trakt/recommendations";
import { registerSearchTools } from "./trakt/search";
import { registerSeasonTools } from "./trakt/seasons";
import { registerShowTools } from "./trakt/shows";
import { registerSyncTools } from "./trakt/sync";
import { registerUserTools } from "./trakt/user";

// Contexte issu de l'auth GitHub, chiffré dans le token et exposé via this.props
type Props = {
  login: string;
  name: string;
  email: string;
  accessToken: string;
};

// Seul ce compte GitHub peut utiliser le MCP Trakt (protège le compte Trakt
// de Thomas des tools d'écriture : checkin, ratings, watchlist, history…).
const ALLOWED_USERNAMES = new Set<string>(["Tholak20"]);

export class TraktMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: "Trakt MCP",
    version: "1.0.0",
  });

  async init() {
    // Utilisateur non autorisé → aucun outil exposé.
    if (!ALLOWED_USERNAMES.has(this.props!.login)) {
      return;
    }

    const client = new TraktClient(this.env);

    // --- Auth (device flow Trakt) ---
    this.server.tool(
      "start_device_auth",
      "Démarre l'authentification Trakt (device flow) : renvoie un code à saisir sur trakt.tv/activate.",
      {},
      async () => ({
        content: [
          { type: "text", text: await startDeviceAuth(client, this.env) },
        ],
      }),
    );
    this.server.tool(
      "check_auth_status",
      "Vérifie et finalise l'authentification Trakt en cours (à appeler après avoir saisi le code).",
      {},
      async () => ({
        content: [
          { type: "text", text: await checkAuthStatus(client, this.env) },
        ],
      }),
    );
    this.server.tool(
      "clear_auth",
      "Déconnecte de Trakt (supprime le token d'authentification stocké).",
      {},
      async () => ({
        content: [{ type: "text", text: await clearAuth(client) }],
      }),
    );

    // --- Domaines (82 tools) ---
    registerShowTools(this.server, client);
    registerMovieTools(this.server, client);
    registerEpisodeTools(this.server, client);
    registerSeasonTools(this.server, client);
    registerSearchTools(this.server, client);
    registerPeopleTools(this.server, client);
    registerCommentTools(this.server, client);
    registerRecommendationTools(this.server, client);
    registerSyncTools(this.server, client);
    registerUserTools(this.server, client);
    registerCheckinTools(this.server, client);
    registerProgressTools(this.server, client);
    registerFavoriteTools(this.server, client);
    registerListTools(this.server, client);
  }
}

export default new OAuthProvider({
  apiHandler: TraktMCP.serve("/mcp") as any,
  apiRoute: "/mcp",
  authorizeEndpoint: "/authorize",
  clientRegistrationEndpoint: "/register",
  defaultHandler: GitHubHandler as any,
  tokenEndpoint: "/token",
});
