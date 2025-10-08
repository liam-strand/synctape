import { MiddlewareHandler } from "hono";
import { sign, verify } from "hono/jwt";
import type { JWTPayload } from "hono/utils/jwt/types";
import { StreamingServiceType } from "./types";
import { refreshSpotifyAccessToken } from "../services/SpotifyService";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 15; // 15 minutes
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

export interface AuthPayload extends JWTPayload {
  userId: number;
  type: "access";
  exp: number;
}

export interface RefreshTokenPayload extends JWTPayload {
  userId: number;
  type: "refresh";
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
}

const encoder = new TextEncoder();

async function hashToken(token: string): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getRefreshSecret(env: Env): string {
  return env.JWT_REFRESH_SECRET || env.JWT_SECRET;
}

export const authMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: { jwtPayload: AuthPayload };
}> = async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    return c.json({ error: "Missing Authorization header" }, 401);
  }

  try {
    const payload = (await verify(token, c.env.JWT_SECRET)) as AuthPayload;

    if (payload.type !== "access" || typeof payload.userId !== "number") {
      return c.json({ error: "Invalid access token" }, 401);
    }

    c.set("jwtPayload", payload);
    await next();
  } catch (error) {
    console.error("JWT verification failed", error);
    return c.json({ error: "Invalid or expired token" }, 401);
  }
};

async function generateAccessToken(env: Env, userId: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: AuthPayload = {
    userId,
    type: "access",
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
    iat: now,
  };

  return sign(payload, env.JWT_SECRET);
}

async function generateRefreshToken(
  env: Env,
  userId: number,
): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + REFRESH_TOKEN_TTL_SECONDS;
  const random = crypto.randomUUID();

  const payload: RefreshTokenPayload = {
    userId,
    type: "refresh",
    exp: expiresAt,
    iat: now,
    jti: random,
  };

  const token = await sign(payload, getRefreshSecret(env));
  return { token, expiresAt };
}

export async function persistRefreshToken(
  env: Env,
  userId: number,
  token: string,
  expiresAt: number,
): Promise<void> {
  const tokenHash = await hashToken(token);
  await env.DB.prepare(
    `INSERT INTO user_refresh_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, ?)`,
  )
    .bind(userId, tokenHash, expiresAt)
    .run();
}

export async function revokeRefreshToken(
  env: Env,
  token: string,
): Promise<void> {
  const tokenHash = await hashToken(token);
  await env.DB.prepare(
    `UPDATE user_refresh_tokens
     SET revoked_at = strftime('%s', 'now')
     WHERE token_hash = ?`,
  )
    .bind(tokenHash)
    .run();
}

export async function validateRefreshToken(
  env: Env,
  token: string,
): Promise<{ userId: number; tokenHash: string }> {
  const payload = (await verify(token, getRefreshSecret(env))) as RefreshTokenPayload;

  if (payload.type !== "refresh" || typeof payload.userId !== "number") {
    throw new Error("Invalid refresh token");
  }

  const tokenHash = await hashToken(token);
  const record = await env.DB.prepare(
    `SELECT id, user_id, expires_at, revoked_at
     FROM user_refresh_tokens
     WHERE token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{ id: number; user_id: number; expires_at: number; revoked_at: number | null }>();

  if (!record) {
    throw new Error("Refresh token not recognized");
  }

  const now = Math.floor(Date.now() / 1000);
  if (record.revoked_at) {
    throw new Error("Refresh token has been revoked");
  }

  if (record.expires_at <= now) {
    await env.DB.prepare("DELETE FROM user_refresh_tokens WHERE id = ?")
      .bind(record.id)
      .run();
    throw new Error("Refresh token has expired");
  }

  return { userId: record.user_id, tokenHash };
}

export async function issueTokenPair(
  env: Env,
  userId: number,
  options?: { revokeTokenHash?: string },
): Promise<TokenPair> {
  const accessToken = await generateAccessToken(env, userId);
  const { token: refreshToken, expiresAt } = await generateRefreshToken(env, userId);

  if (options?.revokeTokenHash) {
    await env.DB.prepare(
      `UPDATE user_refresh_tokens
       SET revoked_at = strftime('%s', 'now')
       WHERE token_hash = ?`,
    )
      .bind(options.revokeTokenHash)
      .run();
  }

  await persistRefreshToken(env, userId, refreshToken, expiresAt);

  return {
    accessToken,
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken,
    refreshTokenExpiresAt: expiresAt,
  };
}


export async function getServiceAccessToken(
  env: Env,
  db: D1Database,
  userId: number,
  service: StreamingServiceType,
): Promise<string | null> {
  const record = await db
    .prepare(
      `SELECT access_token, refresh_token, token_expires_at
       FROM user_streaming_accounts
       WHERE user_id = ? AND service = ?`,
    )
    .bind(userId, service)
    .first<{
      access_token: string;
      refresh_token: string | null;
      token_expires_at: number | null;
    }>();

  if (!record) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = record.token_expires_at ?? 0;

  if (!expiresAt || expiresAt - now > 60) {
    return record.access_token;
  }

  if (!record.refresh_token) {
    return record.access_token;
  }

  try {
    switch (service) {
      case "spotify": {
        const refreshed = await refreshSpotifyAccessToken(env, record.refresh_token);
        const newExpiresAt = now + refreshed.expiresIn;

        await db
          .prepare(
            `UPDATE user_streaming_accounts
             SET access_token = ?, refresh_token = ?, token_expires_at = ?
             WHERE user_id = ? AND service = ?`,
          )
          .bind(
            refreshed.accessToken,
            refreshed.refreshToken,
            newExpiresAt,
            userId,
            service,
          )
          .run();

        return refreshed.accessToken;
      }
      default:
        return record.access_token;
    }
  } catch (error) {
    console.error(`Failed to refresh ${service} access token`, error);
    return record.access_token;
  }
}

export const tokenConstants = {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
};
