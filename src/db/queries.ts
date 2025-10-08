export const getPlaylistsQuery = (db: D1Database, userId: string) => {
  return db
    .prepare(
      `
      SELECT id, name, description, image_url, last_synced_at
      FROM playlists
      WHERE user_id = ?
    `,
    )
    .bind(userId);
};

export const getPlaylistQuery = (
  db: D1Database,
  playlistId: string,
  userId: string,
) => {
  return db
    .prepare(
      `
      SELECT id, name, description, image_url, last_synced_at
      FROM playlists
      WHERE id = ? AND user_id = ?
    `,
    )
    .bind(playlistId, userId);
};

export const getPlaylistTracksQuery = (db: D1Database, playlistId: string) => {
  return db
    .prepare(
      `
      SELECT t.id, t.name, t.artist, t.album, t.image_url, t.duration_ms
      FROM tracks t
      JOIN playlist_tracks pt ON t.id = pt.track_id
      WHERE pt.playlist_id = ?
    `,
    )
    .bind(playlistId);
};

export const updatePlaylistQuery = (
  db: D1Database,
  playlistId: string,
  userId: string,
  name: string,
  description: string,
) => {
  return db
    .prepare(
      `
      UPDATE playlists
      SET name = ?, description = ?
      WHERE id = ? AND user_id = ?
    `,
    )
    .bind(name, description, playlistId, userId);
};

export const deletePlaylistTracksQuery = (
  db: D1Database,
  playlistId: string,
) => {
  return db.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ?").bind(playlistId);
};

export const deletePlaylistLinksQuery = (
  db: D1Database,
  playlistId: string,
) => {
  return db.prepare("DELETE FROM playlist_links WHERE playlist_id = ?").bind(playlistId);
};

export const deletePlaylistQuery = (
  db: D1Database,
  playlistId: string,
  userId: string,
) => {
  return db.prepare("DELETE FROM playlists WHERE id = ? AND user_id = ?").bind(playlistId, userId);
};

export const checkPlaylistOwnershipQuery = (
  db: D1Database,
  playlistId: string,
  userId: string,
) => {
  return db
    .prepare("SELECT id FROM playlists WHERE id = ? AND user_id = ?")
    .bind(playlistId, userId);
};

export const findTrackByIsrcQuery = (db: D1Database, isrc: string) => {
  return db.prepare("SELECT id FROM tracks WHERE isrc = ?").bind(isrc);
};

export const insertTrackQuery = (
  db: D1Database,
  track: {
    name: string;
    artist: string;
    album: string;
    isrc: string;
    duration_ms: number;
    image_url: string;
    spotify_id?: string;
  },
) => {
  return db
    .prepare(
      `
    INSERT INTO tracks (name, artist, album, isrc, duration_ms, image_url, spotify_id)
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id
  `,
    )
    .bind(
      track.name,
      track.artist,
      track.album,
      track.isrc,
      track.duration_ms,
      track.image_url,
      track.spotify_id,
    );
};

export const getMaxPlaylistPositionQuery = (
  db: D1Database,
  playlistId: string,
) => {
  return db
    .prepare("SELECT MAX(position) as max_position FROM playlist_tracks WHERE playlist_id = ?")
    .bind(playlistId);
};

export const addTrackToPlaylistQuery = (
  db: D1Database,
  playlistId: string,
  trackId: number,
  position: number,
) => {
  return db
    .prepare(
      "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
    )
    .bind(playlistId, trackId, position);
};

export const removeTracksFromPlaylistQuery = (
  db: D1Database,
  playlistId: string,
  trackIds: number[],
) => {
  const placeholders = trackIds.map(() => "?").join(",");
  return db
    .prepare(
      `DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id IN (${placeholders})`,
    )
    .bind(playlistId, ...trackIds);
};