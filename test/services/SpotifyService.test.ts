import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SpotifyService } from "../../src/services/SpotifyService";
import {
  SpotifyPlaylist,
  SpotifyUser,
  Paginated,
  SpotifyPlaylistTrack,
} from "../../src/services/spotify-types";

// Helper to create a mock response
const createFetchResponse = (data: any, ok = true, status = 200) => {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(data),
    headers: status === 429 ? { "Retry-After": "1" } : {},
  });
};

describe("SpotifyService", () => {
  let service: SpotifyService;
  let fetchMock: any;

  beforeEach(() => {
    service = new SpotifyService();
    // Mock the internal _fetch method, casting to any to access private member
    fetchMock = vi.spyOn(service as any, "_fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchPlaylist", () => {
    it("should fetch a simple playlist and its tracks", async () => {
      const mockPlaylist: Partial<SpotifyPlaylist> = {
        id: "playlist123",
        name: "Test Playlist",
        description: "A test playlist",
        tracks: {
          items: [
            {
              added_at: "2024-01-01T00:00:00Z",
              track: {
                id: "track1",
                name: "Track 1",
                artists: [{ id: "art1", name: "Artist 1", uri: "uri" }],
                album: {
                  id: "alb1",
                  name: "Album 1",
                  artists: [],
                  images: [],
                  uri: "uri",
                },
                duration_ms: 200000,
                uri: "uri",
              },
            },
          ],
          next: null,
          total: 1,
          limit: 100,
          offset: 0,
          previous: null,
          href: "",
        },
      };

      fetchMock.mockResolvedValue(createFetchResponse(mockPlaylist));

      const playlist = await service.fetchPlaylist("playlist123", "token");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.spotify.com/v1/playlists/playlist123",
        { headers: { Authorization: "Bearer token" } },
      );
      expect(playlist.name).toBe("Test Playlist");
      expect(playlist.tracks.length).toBe(1);
      expect(playlist.tracks[0].name).toBe("Track 1");
    });

    it("should handle pagination when fetching a large playlist", async () => {
      const mockPlaylistPage1: Partial<SpotifyPlaylist> = {
        id: "playlist123",
        name: "Large Playlist",
        description: "A large test playlist",
        tracks: {
          items: [
            {
              added_at: "2024-01-01T00:00:00Z",
              track: {
                id: "track1",
                name: "Track 1",
                artists: [{ id: "art1", name: "Artist 1", uri: "uri" }],
                album: {
                  id: "alb1",
                  name: "Album 1",
                  artists: [],
                  images: [],
                  uri: "uri",
                },
                duration_ms: 200000,
                uri: "uri",
              },
            },
          ],
          next: "https://api.spotify.com/v1/playlists/playlist123/tracks?offset=1&limit=1",
          total: 2,
          limit: 1,
          offset: 0,
          previous: null,
          href: "",
        },
      };
      const mockPlaylistPage2: Paginated<SpotifyPlaylistTrack> = {
        items: [
          {
            added_at: "2024-01-01T00:00:00Z",
            track: {
              id: "track2",
              name: "Track 2",
              artists: [{ id: "art2", name: "Artist 2", uri: "uri" }],
              album: {
                id: "alb2",
                name: "Album 2",
                artists: [],
                images: [],
                uri: "uri",
              },
              duration_ms: 200000,
              uri: "uri",
            },
          },
        ],
        next: null,
        total: 2,
        limit: 1,
        offset: 1,
        previous: "prev",
        href: "href",
      };

      fetchMock
        .mockResolvedValueOnce(createFetchResponse(mockPlaylistPage1))
        .mockResolvedValueOnce(createFetchResponse(mockPlaylistPage2));

      const playlist = await service.fetchPlaylist("playlist123", "token");

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.spotify.com/v1/playlists/playlist123",
        expect.any(Object),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.spotify.com/v1/playlists/playlist123/tracks?offset=1&limit=1",
        expect.any(Object),
      );
      expect(playlist.name).toBe("Large Playlist");
      expect(playlist.tracks.length).toBe(2);
      expect(playlist.tracks.map((t) => t.name)).toEqual([
        "Track 1",
        "Track 2",
      ]);
    });
  });

  describe("createPlaylist", () => {
    it("should fetch user ID and create a new playlist", async () => {
      const mockUser: Partial<SpotifyUser> = { id: "user123" };
      const mockPlaylist: Partial<SpotifyPlaylist> = {
        id: "newPlaylist123",
        name: "New Playlist",
        description: "Desc",
      };

      fetchMock
        .mockResolvedValueOnce(createFetchResponse(mockUser))
        .mockResolvedValueOnce(createFetchResponse(mockPlaylist));

      const playlistId = await service.createPlaylist(
        "New Playlist",
        "A new playlist",
        "token",
      );

      expect(fetchMock).toHaveBeenCalledWith("https://api.spotify.com/v1/me", {
        headers: { Authorization: "Bearer token" },
      });
      const expectedBody = {
        name: "New Playlist",
        description: "A new playlist",
        public: false,
      };
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.spotify.com/v1/users/user123/playlists",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(expectedBody),
        }),
      );
      expect(playlistId).toBe("newPlaylist123");
    });
  });

  describe("updatePlaylistTracks", () => {
    it("should use batching for playlists with more than 100 tracks", async () => {
      fetchMock.mockResolvedValue(createFetchResponse({}));

      const trackIds = Array.from({ length: 150 }, (_, i) => `track${i + 1}`);
      await service.updatePlaylistTracks("playlist123", trackIds, "token");

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const firstBatchUris = trackIds
        .slice(0, 100)
        .map((id) => `spotify:track:${id}`);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.spotify.com/v1/playlists/playlist123/tracks",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ uris: firstBatchUris }),
        }),
      );
      const secondBatchUris = trackIds
        .slice(100)
        .map((id) => `spotify:track:${id}`);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.spotify.com/v1/playlists/playlist123/tracks",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ uris: secondBatchUris }),
        }),
      );
    });
  });
});
