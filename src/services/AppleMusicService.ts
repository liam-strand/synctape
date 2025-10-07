import { StreamingService } from './StreamingService';
import { TrackMetadata, PlaylistData } from '../utils/types';

export class AppleMusicService implements StreamingService {
  private readonly apiBaseUrl = 'https://api.music.apple.com/v1';

  async fetchPlaylist(playlistId: string, accessToken: string): Promise<PlaylistData> {
    // TODO: Implement Apple Music API call
    // GET https://api.music.apple.com/v1/me/library/playlists/{id}
    console.log('AppleMusicService.fetchPlaylist - STUB', { playlistId });
    
    throw new Error('AppleMusicService.fetchPlaylist not yet implemented');
  }

  async createPlaylist(name: string, description: string, accessToken: string): Promise<string> {
    // TODO: Implement Apple Music API call
    // POST https://api.music.apple.com/v1/me/library/playlists
    console.log('AppleMusicService.createPlaylist - STUB', { name, description });
    
    throw new Error('AppleMusicService.createPlaylist not yet implemented');
  }

  async updatePlaylistTracks(playlistId: string, trackIds: string[], accessToken: string): Promise<void> {
    // TODO: Implement Apple Music API call
    // POST https://api.music.apple.com/v1/me/library/playlists/{id}/tracks
    console.log('AppleMusicService.updatePlaylistTracks - STUB', { playlistId, trackCount: trackIds.length });
    
    throw new Error('AppleMusicService.updatePlaylistTracks not yet implemented');
  }

  async searchTrack(track: TrackMetadata, accessToken: string): Promise<string | null> {
    // TODO: Implement Apple Music API call
    // GET https://api.music.apple.com/v1/catalog/{storefront}/search
    console.log('AppleMusicService.searchTrack - STUB', track);
    
    // For now, return null (track not found)
    return null;
  }
}
