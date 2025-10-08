import { Database } from "../db/queries";
import { ServiceFactory } from "../services/ServiceFactory";
import {
  getTrackServiceId,
  filterTracksForService,
} from "../utils/trackMatching";
import { StreamingServiceType } from "../utils/types";
import { getServiceAccessToken } from "../utils/auth";

/**
 * POST /api/create
 *
 * Creates a playlist on the specified streaming service and syncs it with our database playlist.
 */
export async function handleCreate(
  request: Request,
  env: Env,
  userId?: number,
): Promise<Response> {
  try {
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Parse request body
    const body = (await request.json()) as {
      playlistId: number;
      service: StreamingServiceType;
    };

    const { playlistId, service } = body;

    if (!playlistId || !service) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: playlistId, service",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const db = new Database(env.DB);

    // Get the playlist
    const playlist = await db.getPlaylistById(playlistId);

    if (!playlist) {
      return new Response(JSON.stringify({ error: "Playlist not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (playlist.owner_id !== userId) {
      const hasAccess = await db.userHasPlaylistLink(playlistId, userId);
      if (!hasAccess) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Check if a link already exists for this service
    const existingLinks = await db.getPlaylistLinks(playlistId);
    const existingLink = existingLinks.find(
      (link) => link.service === service && link.user_id === userId,
    );

    if (existingLink) {
      return new Response(
        JSON.stringify({ error: `Playlist already exists on ${service}` }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

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

    // Get playlist tracks
    const tracks = await db.getPlaylistTracks(playlistId);

    // Filter tracks to only those available on this service
    const availableTracks = filterTracksForService(tracks, service);
    const skippedCount = tracks.length - availableTracks.length;

    // Extract service-specific track IDs
    const trackIds = availableTracks
      .map((track) => getTrackServiceId(track, service))
      .filter((id) => id !== null) as string[];

    // Create playlist on the streaming service
    const streamingService = ServiceFactory.getService(service);
    const servicePlaylistId = await streamingService.createPlaylist(
      playlist.name,
      playlist.description || "",
      accessToken,
    );

    // Add tracks to the service playlist
    if (trackIds.length > 0) {
      await streamingService.updatePlaylistTracks(
        servicePlaylistId,
        trackIds,
        accessToken,
      );
    }

    // Create the playlist link in our database
    await db.createPlaylistLink(
      playlistId,
      userId,
      service,
      servicePlaylistId,
      false,
    );

    return new Response(
      JSON.stringify({
        success: true,
        servicePlaylistId,
        trackCount: trackIds.length,
        skippedTracks: skippedCount,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in /api/create:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const status =
      errorMessage === "Unauthorized"
        ? 401
        : errorMessage === "Forbidden"
          ? 403
          : 500;

    return new Response(JSON.stringify({ error: errorMessage }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
