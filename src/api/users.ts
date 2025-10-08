import { Hono } from "hono";
import {
  authMiddleware,
  issueTokenPair,
  tokenConstants,
  validateRefreshToken,
  revokeRefreshToken,
} from "../utils/auth";
import type { AuthPayload } from "../utils/auth";

const users = new Hono<{
  Bindings: {
    DB: D1Database;
    JWT_SECRET: string;
    JWT_REFRESH_SECRET: string;
    SPOTIFY_CLIENT_ID: string;
		SPOTIFY_CLIENT_SECRET: string;
  };
  Variables: {
    jwtPayload: AuthPayload;
  };
}>();

/**
 * POST /api/users
 * Create a new user or log in an existing user
 */
users.post("/", async (c) => {
  const { email, username } = await c.req.json();

  if (!email || !username) {
    return c.json({ error: "Email and username are required" }, 400);
  }

  try {
    // Check if user already exists
    let user = await c.env.DB.prepare(
      "SELECT id, email, username FROM users WHERE email = ?",
    )
      .bind(email)
      .first<{ id: number; email: string; username: string }>();

    if (!user) {
      // Create new user if they don't exist
      const { results } = await c.env.DB.prepare(
        "INSERT INTO users (email, username) VALUES (?, ?) RETURNING id, email, username",
      )
        .bind(email, username)
        .all();
      user = results[0] as { id: number; email: string; username: string };
    }

    const tokens = await issueTokenPair(c.env, user.id);

    return c.json({
      accessToken: tokens.accessToken,
      accessTokenExpiresIn: tokens.accessTokenExpiresIn,
      refreshToken: tokens.refreshToken,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
    });
  } catch (e: any) {
    if (e.message.includes("UNIQUE constraint failed")) {
      return c.json({ error: "Username or email already taken" }, 409);
    }
    console.error(e);
    return c.json({ error: "An error occurred" }, 500);
  }
});

/**
 * GET /api/users/me
 * Get the authenticated user's profile
 */
users.get("/me", authMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const userId = payload.userId;

  const user = await c.env.DB.prepare(
    "SELECT id, email, username FROM users WHERE id = ?",
  )
    .bind(userId)
    .first();

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json(user);
});

/**
 * POST /api/users/refresh
 * Exchange a refresh token for a new token pair
 */
users.post("/refresh", async (c) => {
  const { refreshToken } = await c.req.json<{ refreshToken?: string }>();

  if (!refreshToken) {
    return c.json({ error: "Refresh token is required" }, 400);
  }

  try {
    const { userId, tokenHash } = await validateRefreshToken(c.env, refreshToken);
    const tokens = await issueTokenPair(c.env, userId, {
      revokeTokenHash: tokenHash,
    });

    return c.json({
      accessToken: tokens.accessToken,
      accessTokenExpiresIn: tokens.accessTokenExpiresIn,
      refreshToken: tokens.refreshToken,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
    });
  } catch (error) {
    console.error("Failed to refresh token", error);
    return c.json({ error: "Invalid or expired refresh token" }, 401);
  }
});

/**
 * POST /api/users/logout
 * Revoke the provided refresh token (optional extra security)
 */
users.post("/logout", async (c) => {
  const { refreshToken } = await c.req.json<{ refreshToken?: string }>();

  if (!refreshToken) {
    return c.json({ error: "Refresh token is required" }, 400);
  }

  try {
    await revokeRefreshToken(c.env, refreshToken);
    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to revoke refresh token", error);
    return c.json({ error: "Unable to revoke refresh token" }, 400);
  }
});

users.get("/config/token", (c) =>
  c.json({
    accessTokenTtlSeconds: tokenConstants.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: tokenConstants.REFRESH_TOKEN_TTL_SECONDS,
  }),
);

export default users;
