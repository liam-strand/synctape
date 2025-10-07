import { Track, TrackMetadata, StreamingServiceType } from './types';
import { Database } from '../db/queries';

/**
 * Match a track from service metadata to our database
 * Returns the track ID if found or creates a new track
 */
export async function matchOrCreateTrack(
  db: Database,
  trackMetadata: TrackMetadata,
  service: StreamingServiceType,
  serviceTrackId: string
): Promise<number> {
  // Try to find by service-specific ID first
  let track = await db.findTrackByServiceId(service, serviceTrackId);
  
  if (track) {
    return track.id;
  }

  // Try to find by ISRC if available
  if (trackMetadata.isrc) {
    track = await db.findTrackByIsrc(trackMetadata.isrc);
    
    if (track) {
      // Update the track with the service-specific ID
      await db.updateTrackServiceId(track.id, service, serviceTrackId);
      return track.id;
    }
  }

  // TODO: Implement fuzzy matching by name/artist/album
  // For now, create a new track
  const trackData: any = {
    name: trackMetadata.name,
    artist: trackMetadata.artist,
    album: trackMetadata.album,
    isrc: trackMetadata.isrc,
    duration_ms: trackMetadata.duration_ms,
  };

  // Set the service-specific ID
  trackData[`${service}_id`] = serviceTrackId;

  const trackId = await db.createTrack(trackData);
  return trackId;
}

/**
 * Find a track ID for a specific service
 * Returns null if the track doesn't exist on that service
 */
export function getTrackServiceId(track: Track, service: StreamingServiceType): string | null {
  switch (service) {
    case 'spotify':
      return track.spotify_id || null;
    case 'apple_music':
      return track.apple_music_id || null;
    case 'youtube_music':
      return track.youtube_music_id || null;
    default:
      return null;
  }
}

/**
 * Filter tracks to only those available on a specific service
 */
export function filterTracksForService(tracks: Track[], service: StreamingServiceType): Track[] {
  return tracks.filter(track => getTrackServiceId(track, service) !== null);
}
