/**
 * Device flow OAuth Trakt (portage de server/auth/tools.py + client/auth/client.py).
 * L'état du flow en cours et le token vivent dans KV (TRAKT_TOKENS), pas en mémoire :
 * un Durable Object peut être recréé entre deux appels de tool.
 */
import type { PendingDeviceFlow, TraktClient, TraktToken } from "./client";
import { AUTH_VERIFICATION_URL } from "./endpoints";

const BASE_URL = "https://api.trakt.tv";
const USER_AGENT = "trakt-mcp-cloudflare/1.0";

type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
};

/** Démarre le device flow : renvoie les instructions d'activation. */
export async function startDeviceAuth(
  client: TraktClient,
  env: Env,
): Promise<string> {
  if (await client.isAuthenticated()) {
    return "Tu es déjà authentifié auprès de Trakt.";
  }

  const resp = await fetch(`${BASE_URL}/oauth/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({ client_id: env.TRAKT_CLIENT_ID }),
  });
  if (!resp.ok) {
    return `Erreur au démarrage de l'authentification Trakt (HTTP ${resp.status}).`;
  }
  const dc = (await resp.json()) as DeviceCodeResponse;

  const pending: PendingDeviceFlow = {
    device_code: dc.device_code,
    expires_at: Math.floor(Date.now() / 1000) + dc.expires_in,
    interval: dc.interval,
    last_poll: 0,
  };
  await client.savePending(pending);

  const minutes = Math.round(dc.expires_in / 60);
  return `# Authentification Trakt

1. Ouvre **${AUTH_VERIFICATION_URL}**
2. Entre le code : **${dc.user_code}**
3. Approuve l'accès

Le code expire dans ~${minutes} min. Une fois l'autorisation faite sur le site Trakt,
dis-moi « j'ai terminé l'autorisation » et j'utiliserai \`check_auth_status\` pour vérifier.`;
}

/** Vérifie l'état du flow : échange le device_code contre un token si l'utilisateur a validé. */
export async function checkAuthStatus(
  client: TraktClient,
  env: Env,
): Promise<string> {
  if (await client.isAuthenticated()) {
    return "# Authentification réussie\n\nTu es authentifié auprès de Trakt. Tu peux accéder à tes données perso (historique, watchlist, progression…). Utilise `clear_auth` pour te déconnecter.";
  }

  const pending = await client.getPending();
  if (!pending) {
    return "Aucun flow d'authentification actif. Utilise `start_device_auth` pour commencer.";
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > pending.expires_at) {
    await client.clearPending();
    return "Le flow d'authentification a expiré. Relance `start_device_auth`.";
  }
  if (now - pending.last_poll < pending.interval) {
    return `Patiente ${pending.interval - (now - pending.last_poll)} s avant de revérifier.`;
  }

  pending.last_poll = now;
  await client.savePending(pending);

  const resp = await fetch(`${BASE_URL}/oauth/device/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({
      code: pending.device_code,
      client_id: env.TRAKT_CLIENT_ID,
      client_secret: env.TRAKT_CLIENT_SECRET,
    }),
  });

  if (resp.status === 200) {
    await client.saveToken((await resp.json()) as TraktToken);
    await client.clearPending();
    return "# Authentification réussie\n\nTu as autorisé l'application Trakt MCP. Tu peux maintenant accéder à tes données perso.";
  }
  if (resp.status === 400) {
    return "# Autorisation en attente\n\nJe ne vois pas encore l'autorisation. Vérifie que tu as bien saisi le code sur trakt.tv/activate et approuvé, puis redis-moi de vérifier.";
  }
  if (resp.status === 410) {
    await client.clearPending();
    return "Le code a expiré. Relance `start_device_auth`.";
  }
  if (resp.status === 418) {
    await client.clearPending();
    return "L'autorisation a été refusée. Relance `start_device_auth` si tu veux réessayer.";
  }
  if (resp.status === 429) {
    return "Trop de vérifications rapprochées (slow down). Patiente quelques secondes et redemande.";
  }
  return `Échec de la vérification (HTTP ${resp.status}). Réessaie dans un instant.`;
}

/** Déconnexion : purge le token et le flow en cours. */
export async function clearAuth(client: TraktClient): Promise<string> {
  await client.clearPending();
  const cleared = await client.clearToken();
  return cleared
    ? "Déconnecté de Trakt. Ton token d'authentification a été supprimé."
    : "Aucun token à supprimer — tu n'étais pas authentifié.";
}
