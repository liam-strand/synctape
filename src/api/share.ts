import { Database } from "../db/queries";
import { ServiceFactory } from "../services/ServiceFactory";
import { matchOrCreateTrack } from "../utils/trackMatching";
import { StreamingServiceType } from "../utils/types";
import { getServiceAccessToken } from "../utils/auth";

/**
 * POST /api/share
 *
 * Takes a link to an existing playlist on a streaming service and loads it into the database.
 */
export async function handleShare(
  request: Request,
  env: Env,
  userId?: number,
): Promise<Response> {
  try {
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = (await request.json()) as {
      service: StreamingServiceType;
      playlistId: string;
      playlistUrl?: string;
    };

    const { service, playlistId } = body;

    if (!service || !playlistId) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: service, playlistId",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const db = new Database(env.DB);

    // Get the user's access token for this service
    const accessToken = await getServiceAccessToken(env, env.DB, userId, service);

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: `No ${service} account connected` }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Fetch playlist data from the streaming service
    const streamingService = ServiceFactory.getService(service);
    const playlistData = await streamingService.fetchPlaylist(
      playlistId,
      accessToken,
    );

    // Create a new playlist in our database
    const internalPlaylistId = await db.createPlaylist(
      playlistData.name,
      playlistData.description,
      userId,
    );

    // Create the playlist link (mark as source since this is the original)
    await db.createPlaylistLink(
      internalPlaylistId,
      userId,
      service,
      playlistId,
      true,
    );

    // Process and add tracks
    const trackIds: number[] = [];

    for (const trackMetadata of playlistData.tracks) {
      const serviceTrackId = "TODO"; // This needs to come from the API response
      const trackId = await matchOrCreateTrack(
        db,
        trackMetadata,
        service,
        serviceTrackId,
      );
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
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in /api/share:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const status = errorMessage === "Unauthorized" ? 401 : 500;

    return new Response(JSON.stringify({ error: errorMessage }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
