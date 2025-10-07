import { Database } from '../db/queries';
import { ServiceFactory } from '../services/ServiceFactory';
import { getTrackServiceId, filterTracksForService } from '../utils/trackMatching';
import { StreamingServiceType } from '../utils/types';

// Temporary helper to get user ID from header for backward compatibility
async function getUserIdFromRequest(request: Request): Promise<number> {
  const authHeader = request.headers.get('X-User-Id');
  if (!authHeader) {
    // For the new JWT-based auth, the Authorization header should be used.
    // This is a temporary fallback for older handlers.
    // In a real app, you would migrate this to use the JWT middleware.
    throw new Error('Unauthorized');
  }
  const userId = parseInt(authHeader, 10);
  if (isNaN(userId)) {
    throw new Error('Unauthorized: Invalid User ID format');
  }
  return userId;
}

// Temporary helper to get access token, moved from the old auth.ts
async function getAccessToken(
  db: D1Database,
  userId: number,
  service: string
): Promise<string | null> {
  const result = await db
    .prepare('SELECT access_token FROM user_streaming_accounts WHERE user_id = ? AND service = ?')
    .bind(userId, service)
    .first<{ access_token: string }>();
  return result?.access_token ?? null;
}

/**
 * POST /api/create
 *
 * Creates a playlist on the specified streaming service and syncs it with our database playlist.
 */
export async function handleCreate(request: Request, env: Env): Promise<Response> {
  try {
    // Authenticate the user using the temporary header-based method
    const userId = await getUserIdFromRequest(request);

    // Parse request body
    const body = await request.json() as {
      playlistId: number;
      service: StreamingServiceType;
    };

    const { playlistId, service } = body;

    if (!playlistId || !service) {
      return new Response(JSON.stringify({ error: 'Missing required fields: playlistId, service' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = new Database(env.DB);

    // Get the playlist
    const playlist = await db.getPlaylistById(playlistId);
    
    if (!playlist) {
      return new Response(JSON.stringify({ error: 'Playlist not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if a link already exists for this service
    const existingLinks = await db.getPlaylistLinks(playlistId);
    const existingLink = existingLinks.find(link => link.service === service && link.user_id === userId);
    
    if (existingLink) {
      return new Response(JSON.stringify({ error: `Playlist already exists on ${service}` }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get the user's access token for this service
    const accessToken = await getAccessToken(env.DB, userId, service);
    
    if (!accessToken) {
      return new Response(JSON.stringify({ error: `No ${service} account connected` }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get playlist tracks
    const tracks = await db.getPlaylistTracks(playlistId);

    // Filter tracks to only those available on this service
    const availableTracks = filterTracksForService(tracks, service);
    const skippedCount = tracks.length - availableTracks.length;

    // Extract service-specific track IDs
    const trackIds = availableTracks
      .map(track => getTrackServiceId(track, service))
      .filter(id => id !== null) as string[];

    // Create playlist on the streaming service
    const streamingService = ServiceFactory.getService(service);
    const servicePlaylistId = await streamingService.createPlaylist(
      playlist.name,
      playlist.description || '',
      accessToken
    );

    // Add tracks to the service playlist
    if (trackIds.length > 0) {
      await streamingService.updatePlaylistTracks(servicePlaylistId, trackIds, accessToken);
    }

    // Create the playlist link in our database
    await db.createPlaylistLink(playlistId, userId, service, servicePlaylistId, false);

    return new Response(
      JSON.stringify({
        success: true,
        servicePlaylistId,
        trackCount: trackIds.length,
        skippedTracks: skippedCount,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in /api/create:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const status = errorMessage === 'Unauthorized' ? 401 : 500;
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}