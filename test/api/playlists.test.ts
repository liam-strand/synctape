// Mock the auth middleware to bypass JWT validation in tests
vi.mock("../../src/utils/auth", () => ({
  authMiddleware: vi.fn(async (c, next) => {
    c.set("jwtPayload", { userId: "test-user" });
    await next();
  }),
}));

// Mock the entire database queries module.
// This allows us to control the return values of each query function.
vi.mock("../../src/db/queries", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("../../src/db/queries")
  >();
  return {
    ...original, // Keep original exports for types
    getPlaylistsQuery: vi.fn(),
    getPlaylistQuery: vi.fn(),
    getPlaylistTracksQuery: vi.fn(),
    updatePlaylistQuery: vi.fn(),
    deletePlaylistQuery: vi.fn(),
    deletePlaylistTracksQuery: vi.fn(),
    deletePlaylistLinksQuery: vi.fn(),
    addTracksToPlaylistQuery: vi.fn(),
    checkPlaylistOwnershipQuery: vi.fn(),
    findTrackByIsrcQuery: vi.fn(),
    getMaxPlaylistPositionQuery: vi.fn(),
    insertTrackQuery: vi.fn(),
    removeTracksFromPlaylistQuery: vi.fn(),
  };
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import playlists from "../../src/api/playlists";
import * as queries from "../../src/db/queries";
import type { AppType } from "../../env";

// Helper to create a mock D1Result object
const mockD1Result = (data: any) => ({
  results: data,
  success: true,
  meta: { changes: data ? 1 : 0 },
});

// Helper to create a chainable mock for D1 prepared statements
const createMockStatement = (
  data: any = null,
  meta: any = { changes: 1 },
) => {
  const mock: any = {
    all: vi.fn().mockResolvedValue(mockD1Result(data)),
    first: vi.fn().mockResolvedValue(data),
    run: vi.fn().mockResolvedValue({ success: true, meta }),
  };
  return mock;
};

describe("Playlists API", () => {
  let app: Hono<AppType>;

  beforeEach(() => {
    app = new Hono<AppType>();
    app.route("/api/playlists", playlists);
    vi.clearAllMocks();
  });

  describe("GET /api/playlists", () => {
    it("should return a list of playlists for the user", async () => {
      const mockPlaylists = [{ id: 1, name: "My Playlist" }];
      (queries.getPlaylistsQuery as vi.Mock).mockReturnValue(
        createMockStatement(mockPlaylists),
      );

      const res = await app.request("/api/playlists");

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(mockPlaylists);
      expect(queries.getPlaylistsQuery).toHaveBeenCalled();
    });
  });

  describe("GET /api/playlists/:id", () => {
    it("should return a playlist when found", async () => {
      const mockPlaylist = { id: 1, name: "My Playlist" };
      const mockTracks = [{ id: 101, name: "Track 1" }];
      (queries.getPlaylistQuery as vi.Mock).mockReturnValue(
        createMockStatement(mockPlaylist),
      );
      (queries.getPlaylistTracksQuery as vi.Mock).mockReturnValue(
        createMockStatement(mockTracks),
      );

      const res = await app.request("/api/playlists/1");

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ...mockPlaylist, tracks: mockTracks });
    });

    it("should return 404 when playlist is not found", async () => {
      (queries.getPlaylistQuery as vi.Mock).mockReturnValue(
        createMockStatement(null),
      );
      const res = await app.request("/api/playlists/1");
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/playlists/:id", () => {
    it("should update a playlist", async () => {
      (queries.updatePlaylistQuery as vi.Mock).mockReturnValue(
        createMockStatement(null, { changes: 1 }),
      );
      const res = await app.request("/api/playlists/1", {
        method: "PATCH",
        body: JSON.stringify({
          name: "New Name",
          description: "New Description",
        }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
    });

    it("should return 404 when playlist is not found", async () => {
      (queries.updatePlaylistQuery as vi.Mock).mockReturnValue(
        createMockStatement(null, { changes: 0 }),
      );
      const res = await app.request("/api/playlists/1", {
        method: "PATCH",
        body: JSON.stringify({
          name: "New Name",
          description: "New Description",
        }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/playlists/:id", () => {
    it("should delete a playlist", async () => {
      (queries.deletePlaylistQuery as vi.Mock).mockReturnValue(
        createMockStatement(null, { changes: 1 }),
      );
      (queries.deletePlaylistTracksQuery as vi.Mock).mockReturnValue(
        createMockStatement(),
      );
      (queries.deletePlaylistLinksQuery as vi.Mock).mockReturnValue(
        createMockStatement(),
      );
      const res = await app.request("/api/playlists/1", { method: "DELETE" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
    });

    it("should return 404 when playlist is not found", async () => {
      (queries.deletePlaylistQuery as vi.Mock).mockReturnValue(
        createMockStatement(null, { changes: 0 }),
      );
      const res = await app.request("/api/playlists/1", { method: "DELETE" });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/playlists/:id/tracks", () => {
    it("should add tracks to a playlist", async () => {
      (queries.checkPlaylistOwnershipQuery as vi.Mock).mockReturnValue(
        createMockStatement({ id: 1 }),
      );
      (queries.getMaxPlaylistPositionQuery as vi.Mock).mockReturnValue(
        createMockStatement({ max_position: 0 }),
      );
      (queries.findTrackByIsrcQuery as vi.Mock).mockReturnValue(
        createMockStatement(null),
      );
      (queries.insertTrackQuery as vi.Mock).mockReturnValue(
        createMockStatement({ id: 101 }),
      );
      (queries.addTrackToPlaylistQuery as vi.Mock).mockReturnValue(
        createMockStatement(),
      );

      const tracks = [{ isrc: "123" }];
      const res = await app.request("/api/playlists/1/tracks", {
        method: "POST",
        body: JSON.stringify({ tracks }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
    });
  });

  describe("DELETE /api/playlists/:id/tracks", () => {
    it("should remove tracks from a playlist", async () => {
      (queries.checkPlaylistOwnershipQuery as vi.Mock).mockReturnValue(
        createMockStatement({ id: 1 }),
      );
      (queries.removeTracksFromPlaylistQuery as vi.Mock).mockReturnValue(
        createMockStatement(),
      );
      const trackIds = [1, 2];
      const res = await app.request("/api/playlists/1/tracks", {
        method: "DELETE",
        body: JSON.stringify({ trackIds }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
    });
  });
});