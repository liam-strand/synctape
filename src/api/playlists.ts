import { Hono } from "hono";
import { PlaylistService } from "../services/playlist-service";
import type { MiddlewareHandler } from "hono";

export const createPlaylistsRouter = (
  authMiddleware: MiddlewareHandler,
  playlistService: PlaylistService,
) => {
  const playlists = new Hono<{ Bindings: Env }>();

  playlists.use("*", authMiddleware);

  playlists.get("/", async (c) => {
    const userId = c.get("jwtPayload").userId;
    const userPlaylists = await playlistService.getPlaylists(userId);
    return c.json(userPlaylists);
  });

  playlists.get("/:id", async (c) => {
    const userId = c.get("jwtPayload").userId;
    const playlistId = c.req.param("id");
    const playlist = await playlistService.getPlaylist(playlistId, userId);

    if (!playlist) {
      return c.json({ error: "Playlist not found" }, 404);
    }

    return c.json(playlist);
  });

  playlists.patch("/:id", async (c) => {
    const userId = c.get("jwtPayload").userId;
    const playlistId = c.req.param("id");
    const { name, description } = await c.req.json();

    if (!name || !description) {
      return c.json({ error: "Name and description are required" }, 400);
    }

    const success = await playlistService.updatePlaylist(
      playlistId,
      userId,
      name,
      description,
    );

    if (!success) {
      return c.json({ error: "Playlist not found or access denied" }, 404);
    }

    return c.json({ success: true });
  });

  playlists.delete("/:id", async (c) => {
    const userId = c.get("jwtPayload").userId;
    const playlistId = c.req.param("id");
    const success = await playlistService.deletePlaylist(playlistId, userId);

    if (!success) {
      return c.json({ error: "Playlist not found or access denied" }, 404);
    }

    return c.json({ success: true });
  });

  playlists.post("/:id/tracks", async (c) => {
    const userId = c.get("jwtPayload").userId;
    const playlistId = c.req.param("id");
    const { tracks } = await c.req.json();

    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      return c.json({ error: "Invalid tracks payload" }, 400);
    }

    const result = await playlistService.addTracksToPlaylist(
      playlistId,
      userId,
      tracks,
    );

    if (!result.success) {
      return c.json({ error: result.error }, 404);
    }

    return c.json({ success: true });
  });

  playlists.delete("/:id/tracks", async (c) => {
    const userId = c.get("jwtPayload").userId;
    const playlistId = c.req.param("id");
    const { trackIds } = await c.req.json();

    if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
      return c.json({ error: "Invalid trackIds payload" }, 400);
    }

    const result = await playlistService.removeTracksFromPlaylist(
      playlistId,
      userId,
      trackIds,
    );

    if (!result.success) {
      return c.json({ error: result.error }, 404);
    }

    return c.json({ success: true });
  });

  return playlists;
};