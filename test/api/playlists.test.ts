import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { createPlaylistsRouter } from "../../src/api/playlists";
import type { MiddlewareHandler } from "hono";
import type { PlaylistService } from "../../src/services/playlist-service";

// A simple, reliable mock middleware for our tests
const mockAuthMiddleware: MiddlewareHandler = (c, next) => {
  c.set("jwtPayload", { userId: "test-user" });
  return next();
};

describe("Playlists API", () => {
  let app: Hono;
  let mockPlaylistService: PlaylistService;

  beforeEach(() => {
    // Create a mock PlaylistService with mock functions for each method
    mockPlaylistService = {
      getPlaylists: vi.fn(),
      getPlaylist: vi.fn(),
      updatePlaylist: vi.fn(),
      deletePlaylist: vi.fn(),
      addTracksToPlaylist: vi.fn(),
      removeTracksFromPlaylist: vi.fn(),
    } as unknown as PlaylistService;

    // Create the router using the factory, injecting the mock middleware and service
    const playlistsRouter = createPlaylistsRouter(
      mockAuthMiddleware,
      mockPlaylistService,
    );
    app = new Hono();
    app.route("/api/playlists", playlistsRouter);
    vi.clearAllMocks();
  });

  describe("GET /api/playlists", () => {
    it("should return a list of playlists for the user", async () => {
      const mockPlaylists = [{ id: 1, name: "My Playlist" }];
      (mockPlaylistService.getPlaylists as vi.Mock).mockResolvedValue(
        mockPlaylists,
      );

      const res = await app.request("/api/playlists");

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(mockPlaylists);
      expect(mockPlaylistService.getPlaylists).toHaveBeenCalledWith(
        "test-user",
      );
    });
  });

  describe("GET /api/playlists/:id", () => {
    it("should return a playlist when found", async () => {
      const mockPlaylist = { id: 1, name: "My Playlist", tracks: [] };
      (mockPlaylistService.getPlaylist as vi.Mock).mockResolvedValue(
        mockPlaylist,
      );

      const res = await app.request("/api/playlists/1");

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(mockPlaylist);
      expect(mockPlaylistService.getPlaylist).toHaveBeenCalledWith(
        "1",
        "test-user",
      );
    });

    it("should return 404 when playlist is not found", async () => {
      (mockPlaylistService.getPlaylist as vi.Mock).mockResolvedValue(null);

      const res = await app.request("/api/playlists/1");

      expect(res.status).toBe(404);
      expect(mockPlaylistService.getPlaylist).toHaveBeenCalledWith(
        "1",
        "test-user",
      );
    });
  });

  describe("PATCH /api/playlists/:id", () => {
    it("should update a playlist", async () => {
      (mockPlaylistService.updatePlaylist as vi.Mock).mockResolvedValue(true);

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
      expect(mockPlaylistService.updatePlaylist).toHaveBeenCalledWith(
        "1",
        "test-user",
        "New Name",
        "New Description",
      );
    });

    it("should return 404 when playlist is not found", async () => {
      (mockPlaylistService.updatePlaylist as vi.Mock).mockResolvedValue(false);

      const res = await app.request("/api/playlists/1", {
        method: "PATCH",
        body: JSON.stringify({
          name: "New Name",
          description: "New Description",
        }),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(404);
      expect(mockPlaylistService.updatePlaylist).toHaveBeenCalledWith(
        "1",
        "test-user",
        "New Name",
        "New Description",
      );
    });

    it("should return 400 for invalid input", async () => {
      const res = await app.request("/api/playlists/1", {
        method: "PATCH",
        body: JSON.stringify({ name: "New Name" }),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/playlists/:id", () => {
    it("should delete a playlist", async () => {
      (mockPlaylistService.deletePlaylist as vi.Mock).mockResolvedValue(true);

      const res = await app.request("/api/playlists/1", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(mockPlaylistService.deletePlaylist).toHaveBeenCalledWith(
        "1",
        "test-user",
      );
    });

    it("should return 404 when playlist is not found", async () => {
      (mockPlaylistService.deletePlaylist as vi.Mock).mockResolvedValue(false);

      const res = await app.request("/api/playlists/1", {
        method: "DELETE",
      });

      expect(res.status).toBe(404);
      expect(mockPlaylistService.deletePlaylist).toHaveBeenCalledWith(
        "1",
        "test-user",
      );
    });
  });

  describe("POST /api/playlists/:id/tracks", () => {
    it("should add tracks to a playlist", async () => {
      (mockPlaylistService.addTracksToPlaylist as vi.Mock).mockResolvedValue({
        success: true,
      });

      const tracks = [{ isrc: "123" }];
      const res = await app.request("/api/playlists/1/tracks", {
        method: "POST",
        body: JSON.stringify({ tracks }),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(mockPlaylistService.addTracksToPlaylist).toHaveBeenCalledWith(
        "1",
        "test-user",
        tracks,
      );
    });

    it("should return 404 when playlist is not found", async () => {
      (mockPlaylistService.addTracksToPlaylist as vi.Mock).mockResolvedValue({
        success: false,
        error: "Playlist not found or access denied",
      });

      const tracks = [{ isrc: "123" }];
      const res = await app.request("/api/playlists/1/tracks", {
        method: "POST",
        body: JSON.stringify({ tracks }),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(404);
      expect(mockPlaylistService.addTracksToPlaylist).toHaveBeenCalledWith(
        "1",
        "test-user",
        tracks,
      );
    });

    it("should return 400 for invalid input", async () => {
      const res = await app.request("/api/playlists/1/tracks", {
        method: "POST",
        body: JSON.stringify({ tracks: [] }),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/playlists/:id/tracks", () => {
    it("should remove tracks from a playlist", async () => {
      (
        mockPlaylistService.removeTracksFromPlaylist as vi.Mock
      ).mockResolvedValue({ success: true });

      const trackIds = [1, 2];
      const res = await app.request("/api/playlists/1/tracks", {
        method: "DELETE",
        body: JSON.stringify({ trackIds }),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(
        mockPlaylistService.removeTracksFromPlaylist,
      ).toHaveBeenCalledWith("1", "test-user", trackIds);
    });

    it("should return 404 when playlist is not found", async () => {
      (
        mockPlaylistService.removeTracksFromPlaylist as vi.Mock
      ).mockResolvedValue({
        success: false,
        error: "Playlist not found or access denied",
      });

      const trackIds = [1, 2];
      const res = await app.request("/api/playlists/1/tracks", {
        method: "DELETE",
        body: JSON.stringify({ trackIds }),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(404);
      expect(
        mockPlaylistService.removeTracksFromPlaylist,
      ).toHaveBeenCalledWith("1", "test-user", trackIds);
    });

    it("should return 400 for invalid input", async () => {
      const res = await app.request("/api/playlists/1/tracks", {
        method: "DELETE",
        body: JSON.stringify({ trackIds: [] }),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(400);
    });
  });
});