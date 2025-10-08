import { StreamingService } from "./StreamingService";
import { TrackMetadata, PlaylistData } from "../utils/types";

export class SpotifyService implements StreamingService {
  private readonly apiBaseUrl = "https://api.spotify.com/v1";

  async fetchPlaylist(
    playlistId: string,
    accessToken: string,
  ): Promise<PlaylistData> {
    // TODO: Implement Spotify API call
    // GET https://api.spotify.com/v1/playlists/{playlist_id}
    console.log("SpotifyService.fetchPlaylist - STUB", { playlistId });

    throw new Error("SpotifyService.fetchPlaylist not yet implemented");
  }

  async createPlaylist(
    name: string,
    description: string,
    accessToken: string,
  ): Promise<string> {
    // TODO: Implement Spotify API call
    // POST https://api.spotify.com/v1/users/{user_id}/playlists
    console.log("SpotifyService.createPlaylist - STUB", { name, description });

    throw new Error("SpotifyService.createPlaylist not yet implemented");
  }

  async updatePlaylistTracks(
    playlistId: string,
    trackIds: string[],
    accessToken: string,
  ): Promise<void> {
    // TODO: Implement Spotify API call
    // PUT https://api.spotify.com/v1/playlists/{playlist_id}/tracks
    console.log("SpotifyService.updatePlaylistTracks - STUB", {
      playlistId,
      trackCount: trackIds.length,
    });

    throw new Error("SpotifyService.updatePlaylistTracks not yet implemented");
  }

  async searchTrack(
    track: TrackMetadata,
    accessToken: string,
  ): Promise<string | null> {
    // TODO: Implement Spotify API call
    // GET https://api.spotify.com/v1/search?q={query}&type=track
    console.log("SpotifyService.searchTrack - STUB", track);

    // For now, return null (track not found)
    return null;
  }
}
