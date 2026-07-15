/**
 * Client HTTP partagé pour l'API Trakt (portage TS de client/base.py + pool.py).
 * Runtime Workers : fetch natif. Token OAuth stocké dans KV (TRAKT_TOKENS) au
 * lieu de Neon/psycopg2. Refresh automatique sur 401.
 */
import { buildEndpoint, type EndpointKey } from "./endpoints";

export const DEFAULT_LIMIT = 10;
export const DEFAULT_MAX_PAGES = 10;

const BASE_URL = "https://api.trakt.tv";
// User-Agent explicite : sans lui, le Bot Fight Mode Cloudflare de trakt.tv
// bloque les requêtes (cf. doc capture-to-action).
const USER_AGENT = "trakt-mcp-cloudflare/1.0";

const TOKEN_KEY = "default";
const PENDING_KEY = "pending_device";

export type TraktToken = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  created_at: number;
  scope?: string;
  token_type?: string;
};

export type PendingDeviceFlow = {
  device_code: string;
  expires_at: number;
  interval: number;
  last_poll: number;
};

export type Pagination = {
  page: number;
  limit: number;
  page_count: number;
  item_count: number;
};

export type PaginatedResult = {
  data: unknown[];
  pagination: Pagination | null;
};

export class TraktError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "TraktError";
  }
}

/** Réplique config.api.effective_limit : borne api_limit / max_items. */
function effectiveLimit(limit: number): {
  apiLimit: number;
  maxItems: number | null;
} {
  if (limit <= 0) return { apiLimit: 100, maxItems: null }; // 0 = tout récupérer
  return { apiLimit: Math.min(limit, 100), maxItems: limit };
}

export class TraktClient {
  private token: TraktToken | null = null;
  private tokenLoaded = false;

  constructor(private env: Env) {}

  // ---- Token storage (KV) ----
  async getToken(): Promise<TraktToken | null> {
    if (!this.tokenLoaded) {
      const raw = await this.env.TRAKT_TOKENS.get(TOKEN_KEY);
      this.token = raw ? (JSON.parse(raw) as TraktToken) : null;
      this.tokenLoaded = true;
    }
    return this.token;
  }

  async saveToken(t: TraktToken): Promise<void> {
    await this.env.TRAKT_TOKENS.put(TOKEN_KEY, JSON.stringify(t));
    this.token = t;
    this.tokenLoaded = true;
  }

  async clearToken(): Promise<boolean> {
    const existed = (await this.env.TRAKT_TOKENS.get(TOKEN_KEY)) !== null;
    await this.env.TRAKT_TOKENS.delete(TOKEN_KEY);
    this.token = null;
    this.tokenLoaded = true;
    return existed;
  }

  // ---- Pending device flow (KV) ----
  async getPending(): Promise<PendingDeviceFlow | null> {
    const raw = await this.env.TRAKT_TOKENS.get(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingDeviceFlow) : null;
  }
  async savePending(p: PendingDeviceFlow): Promise<void> {
    await this.env.TRAKT_TOKENS.put(PENDING_KEY, JSON.stringify(p));
  }
  async clearPending(): Promise<void> {
    await this.env.TRAKT_TOKENS.delete(PENDING_KEY);
  }

  async isAuthenticated(): Promise<boolean> {
    const t = await this.getToken();
    if (!t) return false;
    return Math.floor(Date.now() / 1000) < t.created_at + t.expires_in;
  }

  private async baseHeaders(
    authenticated: boolean,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": this.env.TRAKT_CLIENT_ID,
      "User-Agent": USER_AGENT,
    };
    if (authenticated) {
      const t = await this.getToken();
      if (t) headers.Authorization = `Bearer ${t.access_token}`;
    }
    return headers;
  }

  /** Rafraîchit l'access_token via le refresh_token. Renvoie true si succès. */
  async refreshAccessToken(): Promise<boolean> {
    const t = await this.getToken();
    if (!t?.refresh_token) return false;
    const resp = await fetch(`${BASE_URL}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        refresh_token: t.refresh_token,
        client_id: this.env.TRAKT_CLIENT_ID,
        client_secret: this.env.TRAKT_CLIENT_SECRET,
        redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
        grant_type: "refresh_token",
      }),
    });
    if (!resp.ok) {
      // 4xx = refresh_token révoqué/invalide → on purge
      if (resp.status >= 400 && resp.status < 500) await this.clearToken();
      return false;
    }
    await this.saveToken((await resp.json()) as TraktToken);
    return true;
  }

  /** Requête bas niveau. Renvoie la Response brute (pour lire headers + body). */
  private async raw(
    method: string,
    endpoint: string,
    opts: {
      query?: Record<string, string | number | undefined>;
      body?: unknown;
      authenticated?: boolean;
      retry?: boolean;
    } = {},
  ): Promise<Response> {
    const { query, body, authenticated = false, retry = true } = opts;
    const url = new URL(BASE_URL + endpoint);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
      }
    }
    const resp = await fetch(url, {
      method,
      headers: await this.baseHeaders(authenticated),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // 401 sur appel authentifié → tentative de refresh unique puis retry
    if (resp.status === 401 && authenticated && retry) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        return this.raw(method, endpoint, { ...opts, retry: false });
      }
    }
    return resp;
  }

  private async parse(resp: Response, endpoint: string): Promise<unknown> {
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new TraktError(
        resp.status,
        `Trakt ${resp.status} sur ${endpoint}: ${text}`,
      );
    }
    if (resp.status === 204) return null;
    return resp.json();
  }

  // ---- Helpers publics ----
  async get(
    key: EndpointKey | string,
    opts: {
      path?: Record<string, string | number>;
      query?: Record<string, string | number | undefined>;
      authenticated?: boolean;
    } = {},
  ): Promise<unknown> {
    const endpoint = key.startsWith("/")
      ? key
      : buildEndpoint(key as EndpointKey, opts.path);
    return this.parse(
      await this.raw("GET", endpoint, {
        query: opts.query,
        authenticated: opts.authenticated,
      }),
      endpoint,
    );
  }

  async post(
    key: EndpointKey | string,
    body: unknown,
    opts: {
      path?: Record<string, string | number>;
      authenticated?: boolean;
    } = {},
  ): Promise<unknown> {
    const endpoint = key.startsWith("/")
      ? key
      : buildEndpoint(key as EndpointKey, opts.path);
    return this.parse(
      await this.raw("POST", endpoint, {
        body,
        authenticated: opts.authenticated,
      }),
      endpoint,
    );
  }

  async del(
    key: EndpointKey | string,
    opts: {
      path?: Record<string, string | number>;
      authenticated?: boolean;
    } = {},
  ): Promise<unknown> {
    const endpoint = key.startsWith("/")
      ? key
      : buildEndpoint(key as EndpointKey, opts.path);
    return this.parse(
      await this.raw("DELETE", endpoint, { authenticated: opts.authenticated }),
      endpoint,
    );
  }

  private paginationFromHeaders(resp: Response): Pagination | null {
    const page = resp.headers.get("X-Pagination-Page");
    if (!page) return null;
    return {
      page: Number(page),
      limit: Number(resp.headers.get("X-Pagination-Limit") ?? "0"),
      page_count: Number(resp.headers.get("X-Pagination-Page-Count") ?? "1"),
      item_count: Number(resp.headers.get("X-Pagination-Item-Count") ?? "0"),
    };
  }

  /**
   * Requête paginée. page=null → auto-pagination jusqu'à `limit` (0 = tout).
   * page=int → une seule page + métadonnées. Réplique BaseClient._fetch_paginated.
   */
  async paginate(
    key: EndpointKey | string,
    opts: {
      path?: Record<string, string | number>;
      query?: Record<string, string | number | undefined>;
      page?: number | null;
      limit?: number;
      maxPages?: number;
      authenticated?: boolean;
    } = {},
  ): Promise<unknown[] | PaginatedResult> {
    const {
      path,
      query = {},
      page = null,
      limit = DEFAULT_LIMIT,
      maxPages = DEFAULT_MAX_PAGES,
      authenticated = false,
    } = opts;
    const endpoint = key.startsWith("/")
      ? key
      : buildEndpoint(key as EndpointKey, path);
    const { apiLimit, maxItems } = effectiveLimit(limit);

    // Page explicite → une seule page
    if (page !== null) {
      const resp = await this.raw("GET", endpoint, {
        query: { ...query, page, limit: apiLimit },
        authenticated,
      });
      const data = (await this.parse(resp, endpoint)) as unknown[];
      return { data, pagination: this.paginationFromHeaders(resp) };
    }

    // Auto-pagination
    const all: unknown[] = [];
    let currentPage = 1;
    for (let i = 0; i < maxPages; i++) {
      const resp = await this.raw("GET", endpoint, {
        query: { ...query, page: currentPage, limit: apiLimit },
        authenticated,
      });
      const chunk = (await this.parse(resp, endpoint)) as unknown[];
      if (Array.isArray(chunk)) all.push(...chunk);
      if (maxItems !== null && all.length >= maxItems)
        return all.slice(0, maxItems);

      const meta = this.paginationFromHeaders(resp);
      if (!meta || currentPage >= meta.page_count) break;
      currentPage += 1;
    }
    return maxItems !== null ? all.slice(0, maxItems) : all;
  }
}
