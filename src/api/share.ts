import { ServiceFactory } from "../services/ServiceFactory";
import { matchOrCreateTrack } from "../utils/trackMatching";
import { StreamingServiceType } from "../utils/types";
import { getServiceAccessToken } from "../utils/auth";
import {
  createPlaylistQuery,
  createPlaylistLinkQuery,
  setPlaylistTracksQuery,
} from "../db/queries";

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

    // Get the user's access token for this service
    const accessToken = await getServiceAccessToken(
      env,
      env.DB,
      userId,
      service,
    );

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
    const newPlaylist = await createPlaylistQuery(
      env.DB,
      playlistData.name,
      playlistData.description,
      userId,
    ).first<{ id: number }>();

    if (!newPlaylist) {
      throw new Error("Failed to create playlist");
    }
    const internalPlaylistId = newPlaylist.id;

    // Create the playlist link (mark as source since this is the original)
    await createPlaylistLinkQuery(
      env.DB,
      internalPlaylistId,
      userId,
      service,
      playlistId,
      true,
    ).run();

    // Process and add tracks
    const trackIds: number[] = [];

    for (const trackMetadata of playlistData.tracks) {
      const trackId = await matchOrCreateTrack(
        env.DB,
        trackMetadata,
        service,
        trackMetadata.id,
      );
      trackIds.push(trackId);
    }

    // Set the playlist tracks
    await setPlaylistTracksQuery(env.DB, internalPlaylistId, trackIds);

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