import { describe, it, expect, beforeAll } from "vitest";
import { SELF } from "cloudflare:test";

describe("Spotify API", () => {
  let authToken: string;

  beforeAll(async () => {
    // Create a new user for this test suite to get a valid token
    const res = await SELF.fetch("https://synctape.ltrs.xyz/api/users", {
      method: "POST",
      body: JSON.stringify({
        email: "spotify-test@example.com",
        username: "spotify-test",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const { accessToken } = await res.json();
    authToken = accessToken;
  });

  it("GET /api/spotify/oauth-url should return a valid URL for an authenticated user", async () => {
    const res = await SELF.fetch(
      "https://synctape.ltrs.xyz/api/spotify/oauth-url",
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBeDefined();
    const url = new URL(json.url);
    expect(url.hostname).toBe("synctape.ltrs.xyz");
    expect(url.pathname).toBe("/auth/spotify");
  });

  it("GET /api/spotify/oauth-url should return 401 for an unauthenticated user", async () => {
    const res = await SELF.fetch(
      "https://synctape.ltrs.xyz/api/spotify/oauth-url",
    );
    expect(res.status).toBe(401);
  });
});