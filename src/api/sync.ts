import { Database } from "../db/queries";
import { ServiceFactory } from "../services/ServiceFactory";
import {
  matchOrCreateTrack,
  getTrackServiceId,
  filterTracksForService,
} from "../utils/trackMatching";
import { PlaylistLink } from "../utils/types";
import { getServiceAccessToken } from "../utils/auth";

/**
 * POST /api/sync
 *
 * Syncs a playlist across all linked streaming services using last-write-wins strategy.
 */
export async function handleSync(
  request: Request,
  env: Env,
  userId?: number,
): Promise<Response> {
  try {
    // Parse request body
    const body = (await request.json()) as {
      playlistId: number;
    };

    const { playlistId } = body;

    if (!playlistId) {
      return new Response(
        JSON.stringify({ error: "Missing required field: playlistId" }),
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

    if (userId && playlist.owner_id !== userId) {
      const hasAccess = await db.userHasPlaylistLink(playlistId, userId);
      if (!hasAccess) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Get all linked services for this playlist
    const links = await db.getPlaylistLinks(playlistId);

    if (links.length === 0) {
      return new Response(
        JSON.stringify({ error: "No linked services found for this playlist" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Fetch latest data from all services and determine which is most recent
    let mostRecentLink: PlaylistLink | null = null;
    let mostRecentData: any = null;
    const errors: Array<{ service: string; error: string }> = [];

    for (const link of links) {
      try {
        const accessToken = await getServiceAccessToken(
          env,
          env.DB,
          link.user_id,
          link.service,
        );

        if (!accessToken) {
          errors.push({
            service: link.service,
            error: "No access token available",
          });
          continue;
        }

        const streamingService = ServiceFactory.getService(link.service);
        const playlistData = await streamingService.fetchPlaylist(
          link.service_playlist_id,
          accessToken,
        );

        const linkTimestamp = link.last_synced_at || 0;
        const mostRecentTimestamp = mostRecentLink?.last_synced_at || 0;

        if (!mostRecentLink || linkTimestamp > mostRecentTimestamp) {
          mostRecentLink = link;
          mostRecentData = { ...playlistData, link };
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        errors.push({ service: link.service, error: errorMessage });
      }
    }

    if (!mostRecentLink || !mostRecentData) {
      return new Response(
        JSON.stringify({
          error: "Failed to fetch data from any service",
          errors,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Update our database with the most recent version
    const trackIds: number[] = [];

    for (const trackMetadata of mostRecentData.tracks) {
      const serviceTrackId = "TODO";

      const trackId = await matchOrCreateTrack(
        db,
        trackMetadata,
        mostRecentLink.service,
        serviceTrackId,
      );
      trackIds.push(trackId);
    }

    await db.setPlaylistTracks(playlistId, trackIds);
    await db.updatePlaylistSyncTimestamp(playlistId);

    const tracks = await db.getPlaylistTracks(playlistId);

    // Propagate to all other services
    const syncedServices: string[] = [mostRecentLink.service];

    for (const link of links) {
      if (link.id === mostRecentLink.id) {
        await db.updatePlaylistLinkSyncTimestamp(link.id);
        continue;
      }

      try {
        const accessToken = await getServiceAccessToken(
          env,
          env.DB,
          link.user_id,
          link.service,
        );

        if (!accessToken) {
          continue;
        }

        const availableTracks = filterTracksForService(tracks, link.service);
        const serviceTrackIds = availableTracks
          .map((track) => getTrackServiceId(track, link.service))
          .filter((id) => id !== null) as string[];

        const streamingService = ServiceFactory.getService(link.service);
        await streamingService.updatePlaylistTracks(
          link.service_playlist_id,
          serviceTrackIds,
          accessToken,
        );

        await db.updatePlaylistLinkSyncTimestamp(link.id);
        syncedServices.push(link.service);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        errors.push({
          service: link.service,
          error: `Failed to update: ${errorMessage}`,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        trackCount: trackIds.length,
        syncedServices,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in /api/sync:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    const status =
      errorMessage === "Forbidden"
        ? 403
        : errorMessage === "Playlist not found"
          ? 404
          : 500;

    return new Response(JSON.stringify({ error: errorMessage }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
