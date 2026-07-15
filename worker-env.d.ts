// Secrets fournis via `wrangler secret put` — absents des types générés par
// `wrangler types` (qui ne connaît que les bindings de wrangler.jsonc).
// On augmente les deux formes de `Env` :
//  - le `Env` global (this.env dans McpAgent, c.env dans Hono)
//  - `Cloudflare.Env` (import `env` de "cloudflare:workers")

interface Secrets {
  // Façade OAuth GitHub (protège l'accès au MCP)
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  COOKIE_ENCRYPTION_KEY: string;
  // Credentials Trakt (accès au compte de Thomas)
  TRAKT_CLIENT_ID: string;
  TRAKT_CLIENT_SECRET: string;
}

interface Env extends Secrets {}

declare namespace Cloudflare {
  interface Env extends Secrets {}
}
