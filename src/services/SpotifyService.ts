import { StreamingService } from "./StreamingService";
import { TrackMetadata, PlaylistData } from "../utils/types";
import { sign, verify } from "hono/jwt";
import type { JWTPayload } from "hono/utils/jwt/types";

const OAUTH_STATE_TTL_SECONDS = 60 * 5; // 5 minutes
const SPOTIFY_TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";

interface SpotifyStatePayload extends JWTPayload {
  purpose: "spotify_oauth_state";
  userId: number;
  returnTo?: string;
  exp: number;
}

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

export class SpotifyService implements StreamingService {
  private readonly apiBaseUrl = "https://api.spotify.com/v1";

  async fetchPlaylist(
    playlistId: string,
    accessToken: string,
  ): Promise<PlaylistData> {
    // TODO: Implement Spotify API call
    // GET https://api.spotify.com/v1/playlists/{playlist_id}
    console.log("SpotifyService.fetchPlaylist - STUB", { playlistId });

    throw new Error("SpotifyService.fetchPlaylist not yet implemented");
  }

  async createPlaylist(
    name: string,
    description: string,
    accessToken: string,
  ): Promise<string> {
    // TODO: Implement Spotify API call
    // POST https://api.spotify.com/v1/users/{user_id}/playlists
    console.log("SpotifyService.createPlaylist - STUB", { name, description });

    throw new Error("SpotifyService.createPlaylist not yet implemented");
  }

  async updatePlaylistTracks(
    playlistId: string,
    trackIds: string[],
    accessToken: string,
  ): Promise<void> {
    // TODO: Implement Spotify API call
    // PUT https://api.spotify.com/v1/playlists/{playlist_id}/tracks
    console.log("SpotifyService.updatePlaylistTracks - STUB", {
      playlistId,
      trackCount: trackIds.length,
    });

    throw new Error("SpotifyService.updatePlaylistTracks not yet implemented");
  }

  async searchTrack(
    track: TrackMetadata,
    accessToken: string,
  ): Promise<string | null> {
    // TODO: Implement Spotify API call
    // GET https://api.spotify.com/v1/search?q={query}&type=track
    console.log("SpotifyService.searchTrack - STUB", track);

    // For now, return null (track not found)
    return null;
  }
}

function buildSpotifyAuthHeader(env: Env): string {
  const credentials = `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`;
  const encoded = btoa(credentials);
  return `Basic ${encoded}`;
}

async function requestSpotifyToken(
  env: Env,
  params: URLSearchParams,
): Promise<SpotifyTokenResponse> {
  const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: buildSpotifyAuthHeader(env),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Spotify token request failed (${response.status}): ${errorBody}`,
    );
  }

  return (await response.json()) as SpotifyTokenResponse;
}

export async function generateSpotifyState(
  env: Env,
  userId: number,
  options?: { returnTo?: string },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SpotifyStatePayload = {
    purpose: "spotify_oauth_state",
    userId,
    returnTo: options?.returnTo,
    iat: now,
    exp: now + OAUTH_STATE_TTL_SECONDS,
  };

  return sign(payload, env.JWT_SECRET);
}

export async function parseSpotifyState(
  env: Env,
  state: string,
): Promise<{ userId: number; returnTo?: string }> {
  const payload = (await verify(state, env.JWT_SECRET)) as SpotifyStatePayload;

  if (payload.purpose !== "spotify_oauth_state" || typeof payload.userId !== "number") {
    throw new Error("Invalid Spotify state token");
  }

  return { userId: payload.userId, returnTo: payload.returnTo };
}

export async function exchangeSpotifyAuthorizationCode(
  env: Env,
  code: string,
  redirectUri: string,
): Promise<SpotifyTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  return requestSpotifyToken(env, params);
}

export async function refreshSpotifyAccessToken(
  env: Env,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const tokenResponse = await requestSpotifyToken(env, params);

  return {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token ?? refreshToken,
    expiresIn: tokenResponse.expires_in,
  };
}
