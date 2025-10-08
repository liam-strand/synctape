import { describe, it, expect, vi } from "vitest";
import { env, SELF } from "cloudflare:test";

// These tests assume Miniflare (via vitest-pool-workers) provisions a fresh D1 DB per test run,
// and that migrations/seed are applied via wrangler config.

describe("users API (real D1)", () => {
  it("POST /api/users logs in seeded user and returns token pair", async () => {
    const res = await SELF.fetch("https://synctape.ltrs.xyz/api/users", {
      method: "POST",
      body: JSON.stringify({ email: "alice@example.com", username: "alice" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.accessToken).toBeDefined();
    expect(json.refreshToken).toBeDefined();
    expect(json.accessTokenExpiresIn).toBeGreaterThan(0);
    expect(json.refreshTokenExpiresAt).toBeGreaterThan(0);
  });

  it("GET /api/users/me returns user profile with valid token", async () => {
    // Log in to get a token
    const loginRes = await SELF.fetch("https://synctape.ltrs.xyz/api/users", {
      method: "POST",
      body: JSON.stringify({ email: "liam@example.com", username: "liam" }),
      headers: { "Content-Type": "application/json" },
    });

    const { accessToken } = await loginRes.json();
    const res = await SELF.fetch("https://synctape.ltrs.xyz/api/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ email: "liam@example.com", username: "liam" });
  });

  it("GET /api/users/me fails without Authorization header", async () => {
    const res = await SELF.fetch("https://synctape.ltrs.xyz/api/users/me");
    expect(res.status).toBe(401);
  });

  it("POST /api/users/refresh rotates refresh token and returns new pair", async () => {
    const loginRes = await SELF.fetch("https://synctape.ltrs.xyz/api/users", {
      method: "POST",
      body: JSON.stringify({
        email: "refresh@example.com",
        username: "refresh",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const firstTokens = await loginRes.json();

    const refreshRes = await SELF.fetch(
      "https://synctape.ltrs.xyz/api/users/refresh",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: firstTokens.refreshToken }),
      },
    );

    expect(refreshRes.status).toBe(200);
    const refreshed = await refreshRes.json();
    expect(refreshed.accessToken).toBeDefined();
    expect(refreshed.refreshToken).toBeDefined();
    expect(refreshed.refreshToken).not.toBe(firstTokens.refreshToken);

    // Old refresh token should now be revoked
    const consoleErrorSpy = vi
      .spyOn((globalThis as any).console, "error")
      .mockImplementation(() => {});

    try {
      const reuseRes = await SELF.fetch(
        "https://synctape.ltrs.xyz/api/users/refresh",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: firstTokens.refreshToken }),
        },
      );
      expect(reuseRes.status).toBe(401);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("POST /api/create returns 401 without JWT", async () => {
    const res = await SELF.fetch("https://synctape.ltrs.xyz/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlistId: 1, service: "spotify" }),
    });

    expect(res.status).toBe(401);
  });
});
