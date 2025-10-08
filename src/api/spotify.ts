import type { Context } from "hono";
import { AuthPayload } from "../utils/auth";
import {
  exchangeSpotifyAuthorizationCode,
  generateSpotifyState,
  parseSpotifyState,
} from "../services/SpotifyService";

const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_REDIRECT_URI = "https://synctape.ltrs.xyz/auth/spotify/callback";
const DEFAULT_RETURN_PATH = "/connect/spotify/success";
const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-read-email",
].join(" ");

type AuthedContext = Context<{
  Bindings: Env;
  Variables: { jwtPayload: AuthPayload };
}>;

type WorkerContext = Context<{ Bindings: Env }>;

interface SpotifyProfileResponse {
  id: string;
  display_name?: string;
  email?: string;
}

function resolveReturnPath(raw: string | null): string | undefined {
  if (!raw) {
    return undefined;
  }

  if (raw.startsWith("/")) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    if (!parsed.pathname.startsWith("/")) {
      return undefined;
    }

    const search = parsed.search ?? "";
    const hash = parsed.hash ?? "";
    return `${parsed.pathname}${search}${hash}`;
  } catch (error) {
    console.warn("Ignoring invalid returnTo parameter", error);
    return undefined;
  }
}

function buildInternalAuthUrl(requestUrl: URL, state: string): string {
  const url = new URL(requestUrl.toString());
  url.pathname = "/auth/spotify";
  url.search = "";
  url.hash = "";
  url.searchParams.set("state", state);
  return url.toString();
}

function buildDefaultReturnUrl(context: WorkerContext, path?: string): string {
  const url = new URL(context.req.url);
  const targetPath = path && path.startsWith("/") ? path : DEFAULT_RETURN_PATH;
  url.pathname = targetPath;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function handleSpotifyOAuthUrl(
  context: AuthedContext,
): Promise<Response> {
  const payload = context.get("jwtPayload");
  const requestUrl = new URL(context.req.url);
  const rawReturnTo = requestUrl.searchParams.get("returnTo");
  const returnTo = resolveReturnPath(rawReturnTo);

  const state = await generateSpotifyState(context.env, payload.userId, {
    returnTo,
  });

  const authUrl = buildInternalAuthUrl(requestUrl, state);

  return context.json({
    url: authUrl,
  });
}

export async function handleSpotifyRedirect(
  context: WorkerContext,
): Promise<Response> {
  const requestUrl = new URL(context.req.url);
  const state = requestUrl.searchParams.get("state");

  if (!state) {
    return new Response("Missing OAuth state", { status: 400 });
  }

  try {
    await parseSpotifyState(context.env, state);
  } catch (error) {
    console.error("Invalid Spotify OAuth state", error);
    return new Response("Invalid OAuth state", { status: 400 });
  }

  const authorizeUrl = new URL(SPOTIFY_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", context.env.SPOTIFY_CLIENT_ID);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", SPOTIFY_REDIRECT_URI);
  authorizeUrl.searchParams.set("scope", SPOTIFY_SCOPES);
  authorizeUrl.searchParams.set("state", state);

  const showDialog = requestUrl.searchParams.get("show_dialog");
  if (showDialog === "true") {
    authorizeUrl.searchParams.set("show_dialog", "true");
  }

  return Response.redirect(authorizeUrl.toString(), 302);
}

export async function handleSpotifyCallback(
  context: WorkerContext,
): Promise<Response> {
  const requestUrl = new URL(context.req.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const errorParam = requestUrl.searchParams.get("error");

  if (errorParam) {
    console.error("Spotify returned an error", errorParam);
    return new Response("Spotify authorization failed", { status: 400 });
  }

  if (!code || !state) {
    return new Response("Missing OAuth parameters", { status: 400 });
  }

  let stateData: { userId: number; returnTo?: string };

  try {
    stateData = await parseSpotifyState(context.env, state);
  } catch (error) {
    console.error("Failed to verify Spotify OAuth state", error);
    return new Response("Invalid OAuth state", { status: 400 });
  }

  try {
    const tokenResponse = await exchangeSpotifyAuthorizationCode(
      context.env,
      code,
      SPOTIFY_REDIRECT_URI,
    );

    const accessToken = tokenResponse.access_token;
    const expiresIn = tokenResponse.expires_in;
    const now = Math.floor(Date.now() / 1000);
    const tokenExpiresAt = now + expiresIn;

    const existing = await context.env.DB.prepare(
      "SELECT refresh_token FROM user_streaming_accounts WHERE user_id = ? AND service = ?",
    )
      .bind(stateData.userId, "spotify")
      .first<{ refresh_token: string | null }>();

    const refreshToken =
      tokenResponse.refresh_token ?? existing?.refresh_token ?? null;

    const profileResponse = await fetch("https://api.spotify.com/v1/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!profileResponse.ok) {
      const body = await profileResponse.text();
      throw new Error(
        `Failed to fetch Spotify profile (${profileResponse.status}): ${body}`,
      );
    }

    const profile = (await profileResponse.json()) as SpotifyProfileResponse;

    await context.env.DB.prepare(
      `INSERT INTO user_streaming_accounts (user_id, service, service_user_id, access_token, refresh_token, token_expires_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, service) DO UPDATE SET
           service_user_id = excluded.service_user_id,
           access_token = excluded.access_token,
           refresh_token = excluded.refresh_token,
           token_expires_at = excluded.token_expires_at`,
    )
      .bind(
        stateData.userId,
        "spotify",
        profile.id,
        accessToken,
        refreshToken,
        tokenExpiresAt,
      )
      .run();

    const redirectTarget = buildDefaultReturnUrl(context, stateData.returnTo);
    return Response.redirect(redirectTarget, 302);
  } catch (error) {
    console.error("Spotify OAuth callback failed", error);
    return new Response("Failed to connect Spotify", { status: 500 });
  }
}
