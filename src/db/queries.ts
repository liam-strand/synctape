export const getPlaylistsQuery = (db: D1Database, userId: string) => {
  return db
    .prepare(
      `
      SELECT id, name, description, last_synced_at
      FROM playlists
      WHERE owner_id = ?
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
      SELECT id, name, description, last_synced_at
      FROM playlists
      WHERE id = ? AND owner_id = ?
    `,
    )
    .bind(playlistId, userId);
};

export const getPlaylistTracksQuery = (db: D1Database, playlistId: string) => {
  return db
    .prepare(
      `
      SELECT t.id, t.name, t.artist, t.album, t.duration_ms
      FROM tracks t
      JOIN playlist_tracks pt ON t.id = pt.track_id
      WHERE pt.playlist_id = ?
      ORDER BY pt.position
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
      WHERE id = ? AND owner_id = ?
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
  return db.prepare("DELETE FROM playlists WHERE id = ? AND owner_id = ?").bind(playlistId, userId);
};

export const checkPlaylistOwnershipQuery = (
  db: D1Database,
  playlistId: string,
  userId: string,
) => {
  return db
    .prepare("SELECT id FROM playlists WHERE id = ? AND owner_id = ?")
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
    isrc?: string;
    duration_ms?: number;
    image_url?: string | null;
    spotify_id?: string;
    [key: string]: any;
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
      track.isrc || null,
      track.duration_ms || null,
      track.image_url || null,
      track.spotify_id || null,
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

export const getPlaylistByIdQuery = (db: D1Database, playlistId: number) => {
  return db.prepare("SELECT * FROM playlists WHERE id = ?").bind(playlistId);
};

export const userHasPlaylistLinkQuery = (
  db: D1Database,
  playlistId: number,
  userId: number,
) => {
  return db
    .prepare("SELECT 1 FROM playlist_links WHERE playlist_id = ? AND user_id = ?")
    .bind(playlistId, userId);
};

export const getPlaylistLinksQuery = (db: D1Database, playlistId: number) => {
  return db
    .prepare("SELECT * FROM playlist_links WHERE playlist_id = ?")
    .bind(playlistId);
};

export const createPlaylistLinkQuery = (
  db: D1Database,
  playlistId: number,
  userId: number,
  service: string,
  servicePlaylistId: string,
  isSource: boolean,
) => {
  return db
    .prepare(
      "INSERT INTO playlist_links (playlist_id, user_id, service, service_playlist_id, is_source) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(playlistId, userId, service, servicePlaylistId, isSource ? 1 : 0);
};

export const createPlaylistQuery = (
  db: D1Database,
  name: string,
  description: string | null,
  ownerId: number,
) => {
  return db
    .prepare(
      "INSERT INTO playlists (name, description, owner_id) VALUES (?, ?, ?) RETURNING id",
    )
    .bind(name, description, ownerId);
};

export const findTrackByServiceIdQuery = (
  db: D1Database,
  service: string,
  serviceTrackId: string,
) => {
  return db
    .prepare(`SELECT * FROM tracks WHERE ${service}_id = ?`)
    .bind(serviceTrackId);
};

export const updateTrackServiceIdQuery = (
  db: D1Database,
  trackId: number,
  service: string,
  serviceTrackId: string,
) => {
  return db
    .prepare(`UPDATE tracks SET ${service}_id = ? WHERE id = ?`)
    .bind(serviceTrackId, trackId);
};

export const setPlaylistTracksQuery = (
  db: D1Database,
  playlistId: number,
  trackIds: number[],
) => {
  const stmts = [
    db.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ?").bind(playlistId),
  ];
  trackIds.forEach((trackId, index) => {
    stmts.push(
      db
        .prepare(
          "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
        )
        .bind(playlistId, trackId, index),
    );
  });
  return db.batch(stmts);
};

export const updatePlaylistSyncTimestampQuery = (
  db: D1Database,
  playlistId: number,
) => {
  return db
    .prepare("UPDATE playlists SET last_synced_at = strftime('%s', 'now') WHERE id = ?")
    .bind(playlistId);
};

export const updatePlaylistLinkSyncTimestampQuery = (
  db: D1Database,
  linkId: number,
) => {
  return db
    .prepare("UPDATE playlist_links SET last_synced_at = strftime('%s', 'now') WHERE id = ?")
    .bind(linkId);
};