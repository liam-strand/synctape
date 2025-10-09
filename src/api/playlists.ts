import { Hono } from "hono";
import { authMiddleware } from "../utils/auth";
import {
  getPlaylistsQuery,
  getPlaylistQuery,
  getPlaylistTracksQuery,
  updatePlaylistQuery,
  deletePlaylistQuery,
  deletePlaylistTracksQuery,
  deletePlaylistLinksQuery,
  addTrackToPlaylistQuery,
  checkPlaylistOwnershipQuery,
  findTrackByIsrcQuery,
  getMaxPlaylistPositionQuery,
  insertTrackQuery,
  removeTracksFromPlaylistQuery,
} from "../db/queries";

const playlists = new Hono<{ Bindings: Env }>();

playlists.use("*", authMiddleware);

playlists.get("/", async (c) => {
  const userId = c.get("jwtPayload").userId;
  const { results } = await getPlaylistsQuery(c.env.DB, userId).all();
  return c.json(results);
});

playlists.get("/:id", async (c) => {
  const userId = c.get("jwtPayload").userId;
  const playlistId = c.req.param("id");
  const playlist = await getPlaylistQuery(c.env.DB, playlistId, userId).first();

  if (!playlist) {
    return c.json({ error: "Playlist not found" }, 404);
  }

  const { results: tracks } = await getPlaylistTracksQuery(
    c.env.DB,
    playlistId,
  ).all();
  return c.json({ ...playlist, tracks });
});

playlists.patch("/:id", async (c) => {
  const userId = c.get("jwtPayload").userId;
  const playlistId = c.req.param("id");
  const { name, description } = await c.req.json();

  if (!name || !description) {
    return c.json({ error: "Name and description are required" }, 400);
  }

  const { success } = await updatePlaylistQuery(
    c.env.DB,
    playlistId,
    userId,
    name,
    description,
  ).run();

  if (!success) {
    return c.json({ error: "Playlist not found or access denied" }, 404);
  }

  return c.json({ success: true });
});

playlists.delete("/:id", async (c) => {
  const userId = c.get("jwtPayload").userId;
  const playlistId = c.req.param("id");

  const info = await deletePlaylistQuery(c.env.DB, playlistId, userId).run();

  if (info.meta.changes > 0) {
    await deletePlaylistTracksQuery(c.env.DB, playlistId).run();
    await deletePlaylistLinksQuery(c.env.DB, playlistId).run();
    return c.json({ success: true });
  }

  return c.json({ error: "Playlist not found or access denied" }, 404);
});

playlists.post("/:id/tracks", async (c) => {
  const userId = c.get("jwtPayload").userId;
  const playlistId = c.req.param("id");
  const { tracks } = await c.req.json();

  if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
    return c.json({ error: "Invalid tracks payload" }, 400);
  }

  const ownershipCheck = await checkPlaylistOwnershipQuery(
    c.env.DB,
    playlistId,
    userId,
  ).first();
  if (!ownershipCheck) {
    return c.json(
      { success: false, error: "Playlist not found or access denied" },
      404,
    );
  }

  const maxPositionResult = await getMaxPlaylistPositionQuery(
    c.env.DB,
    playlistId,
  ).first<{ max_position: number }>();
  let currentPosition = maxPositionResult?.max_position || 0;

  for (const track of tracks) {
    let trackId;
    if (track.isrc) {
      const existingTrack = await findTrackByIsrcQuery(
        c.env.DB,
        track.isrc,
      ).first<{ id: number }>();
      if (existingTrack) {
        trackId = existingTrack.id;
      }
    }

    if (!trackId) {
      const newTrack = await insertTrackQuery(c.env.DB, track).first<{
        id: number;
      }>();
      if (newTrack) {
        trackId = newTrack.id;
      }
    }

    if (trackId) {
      currentPosition++;
      await addTrackToPlaylistQuery(
        c.env.DB,
        playlistId,
        trackId,
        currentPosition,
      ).run();
    }
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

  const ownershipCheck = await checkPlaylistOwnershipQuery(
    c.env.DB,
    playlistId,
    userId,
  ).first();
  if (!ownershipCheck) {
    return c.json(
      { success: false, error: "Playlist not found or access denied" },
      404,
    );
  }

  await removeTracksFromPlaylistQuery(c.env.DB, playlistId, trackIds).run();

  return c.json({ success: true });
});

export default playlists;