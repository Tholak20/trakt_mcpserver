/**
 * Map complète des endpoints de l'API Trakt, portée depuis config/endpoints/*.py.
 * Les placeholders `:xxx` sont substitués par buildEndpoint().
 */
export const TRAKT_ENDPOINTS = {
  // Auth
  device_code: "/oauth/device/code",
  device_token: "/oauth/device/token",
  token: "/oauth/token",
  revoke: "/oauth/revoke",
  // Checkin
  checkin: "/checkin",
  // Comments
  comments_movie: "/movies/:id/comments/:sort",
  comments_show: "/shows/:id/comments/:sort",
  comments_season: "/shows/:id/seasons/:season/comments/:sort",
  comments_episode:
    "/shows/:id/seasons/:season/episodes/:episode/comments/:sort",
  comment: "/comments/:id",
  comment_replies: "/comments/:id/replies",
  // Episodes
  episode_summary: "/shows/:id/seasons/:season/episodes/:episode",
  episode_translations:
    "/shows/:id/seasons/:season/episodes/:episode/translations/:language",
  episode_lists:
    "/shows/:id/seasons/:season/episodes/:episode/lists/:type/:sort",
  episode_people: "/shows/:id/seasons/:season/episodes/:episode/people",
  episode_ratings: "/shows/:id/seasons/:season/episodes/:episode/ratings",
  episode_stats: "/shows/:id/seasons/:season/episodes/:episode/stats",
  episode_watching: "/shows/:id/seasons/:season/episodes/:episode/watching",
  episode_videos: "/shows/:id/seasons/:season/episodes/:episode/videos",
  // Movies
  movies_trending: "/movies/trending",
  movies_popular: "/movies/popular",
  movies_favorited: "/movies/favorited/:period",
  movies_played: "/movies/played/:period",
  movies_watched: "/movies/watched/:period",
  movies_anticipated: "/movies/anticipated",
  movie_ratings: "/movies/:id/ratings",
  movie_videos: "/movies/:id/videos",
  movies_related: "/movies/:id/related",
  movies_boxoffice: "/movies/boxoffice",
  movie_people: "/movies/:id/people",
  // People
  person_summary: "/people/:id",
  person_movies: "/people/:id/movies",
  person_shows: "/people/:id/shows",
  person_lists: "/people/:id/lists/:type/:sort",
  // Progress
  show_progress_watched: "/shows/:id/progress/watched",
  sync_playback: "/sync/playback",
  sync_playback_type: "/sync/playback/:type",
  sync_playback_remove: "/sync/playback/:id",
  // Recommendations
  recommendations_movies: "/recommendations/movies",
  recommendations_shows: "/recommendations/shows",
  hide_movie_recommendation: "/recommendations/movies/:id",
  hide_show_recommendation: "/recommendations/shows/:id",
  unhide_recommendations: "/users/hidden/recommendations/remove",
  // Search
  search: "/search",
  // Seasons
  season_info: "/shows/:id/seasons/:season/info",
  season_episodes: "/shows/:id/seasons/:season",
  season_ratings: "/shows/:id/seasons/:season/ratings",
  season_stats: "/shows/:id/seasons/:season/stats",
  season_people: "/shows/:id/seasons/:season/people",
  season_videos: "/shows/:id/seasons/:season/videos",
  season_watching: "/shows/:id/seasons/:season/watching",
  season_translations: "/shows/:id/seasons/:season/translations/:language",
  season_lists: "/shows/:id/seasons/:season/lists/:type/:sort",
  // Shows
  shows_trending: "/shows/trending",
  shows_popular: "/shows/popular",
  shows_favorited: "/shows/favorited/:period",
  shows_played: "/shows/played/:period",
  shows_watched: "/shows/watched/:period",
  shows_anticipated: "/shows/anticipated",
  show_ratings: "/shows/:id/ratings",
  show_videos: "/shows/:id/videos",
  shows_related: "/shows/:id/related",
  show_seasons: "/shows/:id/seasons",
  show_people: "/shows/:id/people",
  // Sync
  sync_ratings_get: "/sync/ratings/:type/:rating",
  sync_ratings_get_type: "/sync/ratings/:type",
  sync_ratings_add: "/sync/ratings",
  sync_ratings_remove: "/sync/ratings/remove",
  sync_watchlist_add: "/sync/watchlist",
  sync_watchlist_get: "/sync/watchlist/:type/:sort_by/:sort_how",
  sync_watchlist_get_all: "/sync/watchlist",
  sync_watchlist_get_type: "/sync/watchlist/:type",
  sync_watchlist_remove: "/sync/watchlist/remove",
  sync_history_get: "/sync/history/:type/:item_id",
  sync_history_get_type: "/sync/history/:type",
  sync_history_add: "/sync/history",
  sync_history_remove: "/sync/history/remove",
  // User
  user_watched_shows: "/sync/watched/shows",
  user_watched_movies: "/sync/watched/movies",
} as const;

export type EndpointKey = keyof typeof TRAKT_ENDPOINTS;

/** Substitue les placeholders `:xxx` dans un template d'endpoint (valeurs URL-encodées). */
export function buildEndpoint(
  key: EndpointKey,
  replacements: Record<string, string | number> = {},
): string {
  let endpoint: string = TRAKT_ENDPOINTS[key];
  for (const [placeholder, value] of Object.entries(replacements)) {
    endpoint = endpoint.replace(
      `:${placeholder}`,
      encodeURIComponent(String(value)),
    );
  }
  return endpoint;
}

// Constantes device flow (config/auth/constants.py)
export const AUTH_POLL_INTERVAL = 5; // secondes
export const AUTH_EXPIRATION = 600; // secondes (10 min)
export const AUTH_VERIFICATION_URL = "https://trakt.tv/activate";
export const OAUTH_REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";
