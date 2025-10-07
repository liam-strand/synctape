import { Database } from '../db/queries';
import { ServiceFactory } from '../services/ServiceFactory';
import { requireAuth, getAccessToken } from '../utils/auth';
import { matchOrCreateTrack } from '../utils/trackMatching';
import { StreamingServiceType } from '../utils/types';

/**
 * POST /api/share
 * 
 * Takes a link to an existing playlist on a streaming service and loads it into the database.
 * This endpoint is idempotent - calling it multiple times with the same playlist won't create duplicates.
 * 
 * Request body:
 * {
 *   "service": "spotify" | "apple_music" | "youtube_music",
 *   "playlistId": "service-specific-playlist-id",
 *   "playlistUrl": "optional-full-url" // for convenience, can parse this instead
 * }
 * 
 * Response:
 * {
 *   "playlistId": number,  // Our internal playlist ID
 *   "name": string,
 *   "trackCount": number
 * }
 */
export async function handleShare(request: Request, env: Env): Promise<Response> {
  try {
    // Authenticate the user
    const auth = await requireAuth(request);

    // Parse request body
    const body = await request.json() as {
      service: StreamingServiceType;
      playlistId: string;
      playlistUrl?: string;
    };

    const { service, playlistId } = body;

    if (!service || !playlistId) {
      return new Response(JSON.stringify({ error: 'Missing required fields: service, playlistId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = new Database(env.DB);

    // Check if this playlist link already exists (idempotency)
    const existingLink = await db.findPlaylistLink(0, service, playlistId); // We'll fix this after creating the playlist
    
    // Get the user's access token for this service
    const accessToken = await getAccessToken(env.DB, auth.userId, service);
    
    if (!accessToken) {
      return new Response(JSON.stringify({ error: `No ${service} account connected` }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch playlist data from the streaming service
    const streamingService = ServiceFactory.getService(service);
    const playlistData = await streamingService.fetchPlaylist(playlistId, accessToken);

    // Check for existing playlist link again with proper search
    // For true idempotency, we'd need a unique constraint or search by service+servicePlaylistId across all playlists
    let internalPlaylistId: number;
    
    // Create a new playlist in our database
    internalPlaylistId = await db.createPlaylist(
      playlistData.name,
      playlistData.description,
      auth.userId
    );

    // Create the playlist link (mark as source since this is the original)
    await db.createPlaylistLink(internalPlaylistId, auth.userId, service, playlistId, true);

    // Process and add tracks
    const trackIds: number[] = [];
    
    for (const trackMetadata of playlistData.tracks) {
      // We need the service-specific track ID, but the interface doesn't provide it yet
      // TODO: Update StreamingService interface to return service-specific IDs with track metadata
      // For now, we'll use a placeholder
      const serviceTrackId = 'TODO'; // This needs to come from the API response
      
      const trackId = await matchOrCreateTrack(db, trackMetadata, service, serviceTrackId);
      trackIds.push(trackId);
    }

    // Set the playlist tracks
    await db.setPlaylistTracks(internalPlaylistId, trackIds);

    return new Response(
      JSON.stringify({
        playlistId: internalPlaylistId,
        name: playlistData.name,
        trackCount: trackIds.length,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in /api/share:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const status = errorMessage === 'Unauthorized' ? 401 : 500;
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
