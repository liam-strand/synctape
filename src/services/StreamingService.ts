import { TrackMetadata, PlaylistData } from "../utils/types";

/**
 * Interface that all streaming service implementations must follow
 */
export interface StreamingService {
  /**
   * Fetch playlist metadata and tracks from the service
   * @param playlistId - The service-specific playlist ID
   * @param accessToken - OAuth access token for the service
   * @returns Playlist data including tracks
   */
  fetchPlaylist(playlistId: string, accessToken: string): Promise<PlaylistData>;

  /**
   * Create a new playlist on the service
   * @param name - Playlist name
   * @param description - Playlist description
   * @param accessToken - OAuth access token for the service
   * @returns The service-specific playlist ID
   */
  createPlaylist(
    name: string,
    description: string,
    accessToken: string,
  ): Promise<string>;

  /**
   * Update playlist tracks (replaces all tracks)
   * @param playlistId - The service-specific playlist ID
   * @param trackIds - Array of service-specific track IDs in order
   * @param accessToken - OAuth access token for the service
   */
  updatePlaylistTracks(
    playlistId: string,
    trackIds: string[],
    accessToken: string,
  ): Promise<void>;

  /**
   * Search for a track by metadata (for future matching)
   * @param track - Track metadata to search for
   * @returns Service-specific track ID if found, null otherwise
   */
  searchTrack(
    track: TrackMetadata,
    accessToken: string,
  ): Promise<string | null>;
}
