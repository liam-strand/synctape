import {
  Track,
  Playlist,
  PlaylistTrack,
  User,
  PlaylistLink,
  StreamingServiceType,
} from "../utils/types";

/**
 * Database query utilities for D1
 */
export class Database {
  constructor(private db: D1Database) {}

  // ============================================
  // TRACK QUERIES
  // ============================================

  async createTrack(
    track: Omit<Track, "id" | "created_at" | "last_verified">,
  ): Promise<number> {
    const result = await this.db
      .prepare(
        `INSERT INTO tracks (name, artist, album, isrc, duration_ms, spotify_id, apple_music_id, youtube_music_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        track.name,
        track.artist,
        track.album,
        track.isrc || null,
        track.duration_ms || null,
        track.spotify_id || null,
        track.apple_music_id || null,
        track.youtube_music_id || null,
      )
      .run();

    return result.meta.last_row_id;
  }

  async getTrackById(trackId: number): Promise<Track | null> {
    const result = await this.db
      .prepare("SELECT * FROM tracks WHERE id = ?")
      .bind(trackId)
      .first<Track>();

    return result;
  }

  async findTrackByServiceId(
    service: StreamingServiceType,
    serviceTrackId: string,
  ): Promise<Track | null> {
    const column = `${service}_id`;
    const result = await this.db
      .prepare(`SELECT * FROM tracks WHERE ${column} = ?`)
      .bind(serviceTrackId)
      .first<Track>();

    return result;
  }

  async findTrackByIsrc(isrc: string): Promise<Track | null> {
    const result = await this.db
      .prepare("SELECT * FROM tracks WHERE isrc = ?")
      .bind(isrc)
      .first<Track>();

    return result;
  }

  async updateTrackServiceId(
    trackId: number,
    service: StreamingServiceType,
    serviceTrackId: string,
  ): Promise<void> {
    const column = `${service}_id`;
    await this.db
      .prepare(
        `UPDATE tracks SET ${column} = ?, last_verified = strftime('%s', 'now') WHERE id = ?`,
      )
      .bind(serviceTrackId, trackId)
      .run();
  }

  // ============================================
  // PLAYLIST QUERIES
  // ============================================

  async createPlaylist(
    name: string,
    description: string,
    ownerId: number,
  ): Promise<number> {
    const result = await this.db
      .prepare(
        `INSERT INTO playlists (name, description, owner_id)
         VALUES (?, ?, ?)`,
      )
      .bind(name, description, ownerId)
      .run();

    return result.meta.last_row_id;
  }

  async getPlaylistById(playlistId: number): Promise<Playlist | null> {
    const result = await this.db
      .prepare("SELECT * FROM playlists WHERE id = ?")
      .bind(playlistId)
      .first<Playlist>();

    return result;
  }

  async updatePlaylistTimestamp(playlistId: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE playlists SET updated_at = strftime('%s', 'now') WHERE id = ?`,
      )
      .bind(playlistId)
      .run();
  }

  async updatePlaylistSyncTimestamp(playlistId: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE playlists SET last_synced_at = strftime('%s', 'now') WHERE id = ?`,
      )
      .bind(playlistId)
      .run();
  }

  async deletePlaylist(playlistId: number, ownerId: number): Promise<boolean> {
    const result = await this.db
      .prepare("DELETE FROM playlists WHERE id = ? AND owner_id = ?")
      .bind(playlistId, ownerId)
      .run();

    return result.meta.changes > 0;
  }

  // ============================================
  // PLAYLIST TRACKS QUERIES
  // ============================================

  async addTrackToPlaylist(
    playlistId: number,
    trackId: number,
    position: number,
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO playlist_tracks (playlist_id, track_id, position)
         VALUES (?, ?, ?)`,
      )
      .bind(playlistId, trackId, position)
      .run();
  }

  async getPlaylistTracks(playlistId: number): Promise<Track[]> {
    const result = await this.db
      .prepare(
        `SELECT t.* FROM tracks t
         JOIN playlist_tracks pt ON t.id = pt.track_id
         WHERE pt.playlist_id = ?
         ORDER BY pt.position`,
      )
      .bind(playlistId)
      .all<Track>();

    return result.results;
  }

  async clearPlaylistTracks(playlistId: number): Promise<void> {
    await this.db
      .prepare("DELETE FROM playlist_tracks WHERE playlist_id = ?")
      .bind(playlistId)
      .run();
  }

  async setPlaylistTracks(
    playlistId: number,
    trackIds: number[],
  ): Promise<void> {
    // Clear existing tracks
    await this.clearPlaylistTracks(playlistId);

    // Add new tracks with positions
    for (let i = 0; i < trackIds.length; i++) {
      await this.addTrackToPlaylist(playlistId, trackIds[i], i);
    }

    // Update playlist timestamp
    await this.updatePlaylistTimestamp(playlistId);
  }

  // ============================================
  // PLAYLIST LINK QUERIES
  // ============================================

  async createPlaylistLink(
    playlistId: number,
    userId: number,
    service: StreamingServiceType,
    servicePlaylistId: string,
    isSource: boolean = false,
  ): Promise<number> {
    const result = await this.db
      .prepare(
        `INSERT INTO playlist_links (playlist_id, user_id, service, service_playlist_id, is_source)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(playlistId, userId, service, servicePlaylistId, isSource ? 1 : 0)
      .run();

    return result.meta.last_row_id;
  }

  async getPlaylistLinks(playlistId: number): Promise<PlaylistLink[]> {
    const result = await this.db
      .prepare("SELECT * FROM playlist_links WHERE playlist_id = ?")
      .bind(playlistId)
      .all<PlaylistLink>();

    return result.results;
  }

  async userHasPlaylistLink(
    playlistId: number,
    userId: number,
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        "SELECT 1 FROM playlist_links WHERE playlist_id = ? AND user_id = ? LIMIT 1",
      )
      .bind(playlistId, userId)
      .first();

    return !!result;
  }

  async findPlaylistLink(
    playlistId: number,
    service: StreamingServiceType,
    servicePlaylistId: string,
  ): Promise<PlaylistLink | null> {
    const result = await this.db
      .prepare(
        "SELECT * FROM playlist_links WHERE playlist_id = ? AND service = ? AND service_playlist_id = ?",
      )
      .bind(playlistId, service, servicePlaylistId)
      .first<PlaylistLink>();

    return result;
  }

  async updatePlaylistLinkSyncTimestamp(linkId: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE playlist_links SET last_synced_at = strftime('%s', 'now') WHERE id = ?`,
      )
      .bind(linkId)
      .run();
  }

  // ============================================
  // USER QUERIES
  // ============================================

  async getUserById(userId: number): Promise<User | null> {
    const result = await this.db
      .prepare("SELECT * FROM users WHERE id = ?")
      .bind(userId)
      .first<User>();

    return result;
  }

  async getUserStreamingAccount(userId: number, service: StreamingServiceType) {
    const result = await this.db
      .prepare(
        "SELECT * FROM user_streaming_accounts WHERE user_id = ? AND service = ?",
      )
      .bind(userId, service)
      .first();

    return result;
  }
}
