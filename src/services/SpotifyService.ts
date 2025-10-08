import {
  SpotifyPlaylist,
  SpotifyPlaylistTrack,
  Paginated,
  SpotifyUser,
} from "./spotify-types";
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

  // Wrapper for global fetch to allow for easier mocking in tests
  private _fetch(url: string, options?: RequestInit): Promise<Response> {
    return fetch(url, options);
  }

  async fetchPlaylist(
    playlistId: string,
    accessToken: string,
  ): Promise<PlaylistData> {
    const url = `${this.apiBaseUrl}/playlists/${playlistId}`;
    const response = await this._fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch playlist: ${response.statusText}`);
    }

    const playlistData: SpotifyPlaylist = await response.json();
    let tracks: SpotifyPlaylistTrack[] = playlistData.tracks.items;

    // Handle pagination for playlists with more than 100 tracks
    let nextUrl = playlistData.tracks.next;
    while (nextUrl) {
      const nextResponse = await this._fetch(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!nextResponse.ok) {
        throw new Error(
          `Failed to fetch next page of tracks: ${nextResponse.statusText}`,
        );
      }
      const nextData: Paginated<SpotifyPlaylistTrack> =
        await nextResponse.json();
      tracks = tracks.concat(nextData.items);
      nextUrl = nextData.next;
    }

    return {
      name: playlistData.name,
      description: playlistData.description,
      tracks: tracks.map(({ track }) => ({
        name: track.name,
        artist: track.artists.map((a) => a.name).join(", "),
        album: track.album.name,
        isrc: track.isrc,
        duration_ms: track.duration_ms,
      })),
      updatedAt: new Date(), // Or parse from response if available
    };
  }

  async createPlaylist(
    name: string,
    description: string,
    accessToken: string,
  ): Promise<string> {
    const userProfileResponse = await this._fetch(`${this.apiBaseUrl}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userProfileResponse.ok) {
      throw new Error(
        `Failed to fetch user profile: ${userProfileResponse.statusText}`,
      );
    }

    const user: SpotifyUser = await userProfileResponse.json();
    const userId = user.id;

    const createPlaylistResponse = await this._fetch(
      `${this.apiBaseUrl}/users/${userId}/playlists`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, description, public: false }),
      },
    );

    if (!createPlaylistResponse.ok) {
      throw new Error(
        `Failed to create playlist: ${createPlaylistResponse.statusText}`,
      );
    }

    const newPlaylist: SpotifyPlaylist = await createPlaylistResponse.json();
    return newPlaylist.id;
  }

  async updatePlaylistTracks(
    playlistId: string,
    trackIds: string[],
    accessToken: string,
  ): Promise<void> {
    const trackUris = trackIds.map((id) => `spotify:track:${id}`);
    const maxTracksPerRequest = 100;

    // Replace the first 100 tracks
    const firstBatch = trackUris.slice(0, maxTracksPerRequest);
    const replaceResponse = await this.makeUpdatePlaylistRequest(
      playlistId,
      firstBatch,
      accessToken,
      "PUT",
    );
    if (!replaceResponse.ok) {
      await this.handleRateLimit(replaceResponse);
      throw new Error(
        `Failed to replace playlist tracks: ${replaceResponse.statusText}`,
      );
    }

    // Add remaining tracks in subsequent batches
    for (let i = maxTracksPerRequest; i < trackUris.length; i += maxTracksPerRequest) {
      const batch = trackUris.slice(i, i + maxTracksPerRequest);
      const addResponse = await this.makeUpdatePlaylistRequest(
        playlistId,
        batch,
        accessToken,
        "POST",
      );
      if (!addResponse.ok) {
        await this.handleRateLimit(addResponse);
        throw new Error(
          `Failed to add playlist tracks: ${addResponse.statusText}`,
        );
      }
    }
  }

  private async makeUpdatePlaylistRequest(
    playlistId: string,
    trackUris: string[],
    accessToken: string,
    method: "PUT" | "POST",
  ): Promise<Response> {
    const url = `${this.apiBaseUrl}/playlists/${playlistId}/tracks`;
    return this._fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: trackUris }),
    });
  }

  private async handleRateLimit(response: Response): Promise<void> {
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      if (retryAfter) {
        const delayMs = parseInt(retryAfter, 10) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
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

  if (
    payload.purpose !== "spotify_oauth_state" ||
    typeof payload.userId !== "number"
  ) {
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
