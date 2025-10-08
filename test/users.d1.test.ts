import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";

// These tests assume Miniflare (via vitest-pool-workers) provisions a fresh D1 DB per test run,
// and that migrations/seed are applied via wrangler config.

describe("users API (real D1)", () => {
  it("POST /api/users logs in seeded user and returns a token", async () => {
    const res = await SELF.fetch("https://synctape.ltrs.xyz/api/users", {
      method: "POST",
      body: JSON.stringify({ email: "alice@example.com", username: "alice" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toBeDefined();
  });

  it("GET /api/users/me returns user profile with valid token", async () => {
    // Log in to get a token
    const loginRes = await SELF.fetch("https://synctape.ltrs.xyz/api/users", {
      method: "POST",
      body: JSON.stringify({ email: "liam@example.com", username: "liam" }),
      headers: { "Content-Type": "application/json" },
    });

    const { token } = await loginRes.json();
    const res = await SELF.fetch("https://synctape.ltrs.xyz/api/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ email: "liam@example.com", username: "liam" });
  });
});
