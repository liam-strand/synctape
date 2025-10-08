import {
  addTrackToPlaylistQuery,
  checkPlaylistOwnershipQuery,
  deletePlaylistLinksQuery,
  deletePlaylistQuery,
  deletePlaylistTracksQuery,
  findTrackByIsrcQuery,
  getMaxPlaylistPositionQuery,
  getPlaylistsQuery,
  getPlaylistQuery,
  getPlaylistTracksQuery,
  insertTrackQuery,
  removeTracksFromPlaylistQuery,
  updatePlaylistQuery,
} from "../db/queries";

export class PlaylistService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async getPlaylists(userId: string) {
    const stmt = getPlaylistsQuery(this.env.DB, userId);
    const { results } = await stmt.all();
    return results;
  }

  async getPlaylist(playlistId: string, userId: string) {
    const playlistStmt = getPlaylistQuery(this.env.DB, playlistId, userId);
    const playlist = await playlistStmt.first();

    if (!playlist) {
      return null;
    }

    const tracksStmt = getPlaylistTracksQuery(this.env.DB, playlistId);
    const { results: tracks } = await tracksStmt.all();

    return { ...playlist, tracks };
  }

  async updatePlaylist(
    playlistId: string,
    userId: string,
    name: string,
    description: string,
  ) {
    const stmt = updatePlaylistQuery(
      this.env.DB,
      playlistId,
      userId,
      name,
      description,
    );
    const { success } = await stmt.run();
    return success;
  }

  async deletePlaylist(playlistId: string, userId: string) {
    const deleteTracksStmt = deletePlaylistTracksQuery(this.env.DB, playlistId);
    const deleteLinksStmt = deletePlaylistLinksQuery(this.env.DB, playlistId);
    const deletePlaylistStmt = deletePlaylistQuery(
      this.env.DB,
      playlistId,
      userId,
    );

    const info = await deletePlaylistStmt.run();

    if (info.changes > 0) {
      await deleteTracksStmt.run();
      await deleteLinksStmt.run();
      return true;
    }

    return false;
  }

  async addTracksToPlaylist(
    playlistId: string,
    userId: string,
    tracks: any[],
  ) {
    const ownershipCheck = await checkPlaylistOwnershipQuery(
      this.env.DB,
      playlistId,
      userId,
    ).first();

    if (!ownershipCheck) {
      return { success: false, error: "Playlist not found or access denied" };
    }

    const maxPositionResult = await getMaxPlaylistPositionQuery(
      this.env.DB,
      playlistId,
    ).first<{ max_position: number }>();

    let currentPosition = maxPositionResult?.max_position || 0;

    for (const track of tracks) {
      let trackId;
      const existingTrack = await findTrackByIsrcQuery(
        this.env.DB,
        track.isrc,
      ).first<{ id: number }>();

      if (existingTrack) {
        trackId = existingTrack.id;
      } else {
        const newTrack = await insertTrackQuery(this.env.DB, track).first<{
          id: number;
        }>();
        if (newTrack) {
          trackId = newTrack.id;
        }
      }

      if (trackId) {
        currentPosition++;
        await addTrackToPlaylistQuery(
          this.env.DB,
          playlistId,
          trackId,
          currentPosition,
        ).run();
      }
    }

    return { success: true };
  }

  async removeTracksFromPlaylist(
    playlistId: string,
    userId: string,
    trackIds: number[],
  ) {
    const ownershipCheck = await checkPlaylistOwnershipQuery(
      this.env.DB,
      playlistId,
      userId,
    ).first();

    if (!ownershipCheck) {
      return { success: false, error: "Playlist not found or access denied" };
    }

    const stmt = removeTracksFromPlaylistQuery(
      this.env.DB,
      playlistId,
      trackIds,
    );
    const { success } = await stmt.run();

    return { success };
  }
}