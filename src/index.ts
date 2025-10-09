import { withSentry, captureException } from "@sentry/cloudflare";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { writeMetric } from "./utils/metrics";
import { handleShare } from "./api/share";
import { handleCreate } from "./api/create";
import { handleSync } from "./api/sync";
import users from "./api/users";
import playlists from "./api/playlists";
import { authMiddleware } from "./utils/auth";
import {
  handleSpotifyCallback,
  handleSpotifyOAuthUrl,
  handleSpotifyRedirect,
} from "./api/spotify";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS", "PATCH", "DELETE"],
  }),
);

// API routes
app.post("/api/share", authMiddleware, (c) =>
  handleShare(c.req.raw, c.env, c.get("jwtPayload").userId),
);
app.post("/api/create", authMiddleware, (c) =>
  handleCreate(c.req.raw, c.env, c.get("jwtPayload").userId),
);
app.post("/api/sync", authMiddleware, (c) =>
  handleSync(c.req.raw, c.env, c.get("jwtPayload").userId),
);
app.route("/api/users", users);
app.route("/api/playlists", playlists);

app.get("/api/spotify/oauth-url", authMiddleware, handleSpotifyOAuthUrl);

// OAuth entrypoints
app.get("/auth/spotify", handleSpotifyRedirect);
app.get("/auth/spotify/callback", handleSpotifyCallback);

// Connection Landing Pages
app.get("/connect/spotify/success", (c) => {
  return c.text("Spotify Connected!");
});

// Health check endpoint
app.get("/health", async (c) => {
  const checks = {
    db: "ok",
    spotify: "ok",
  };
  let isHealthy = true;

  // Check DB connectivity
  try {
    await c.env.DB.prepare("SELECT 1").first();
  } catch (e: any) {
    checks.db = e.message;
    isHealthy = false;
    captureException(e);
  }

  // Check Spotify API connectivity
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          btoa(c.env.SPOTIFY_CLIENT_ID + ":" + c.env.SPOTIFY_CLIENT_SECRET),
      },
      body: "grant_type=client_credentials",
    });

    if (!res.ok) {
      throw new Error(`Spotify API returned status ${res.status}`);
    }
  } catch (e: any) {
    checks.spotify = e.message;
    isHealthy = false;
    captureException(e);
  }

  return c.json(
    {
      status: isHealthy ? "ok" : "error",
      checks,
    },
    isHealthy ? 200 : 503,
  );
});

export default withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
  }),
  {
    fetch: app.fetch,

    async scheduled(
      controller: ScheduledController,
      env: Env,
      ctx: ExecutionContext,
    ): Promise<void> {
      console.log("Running scheduled sync job");
      let successfulSyncs = 0;
      let failedSyncs = 0;

      try {
        const stmt = env.DB.prepare(`
        SELECT id FROM playlists 
        WHERE last_synced_at IS NULL 
           OR last_synced_at < strftime('%s', 'now') - 86400
        LIMIT 100
      `);

        const { results } = await stmt.all<{ id: number }>();

        for (const playlist of results) {
          try {
            const mockRequest = new Request(
              "https://synctape.ltrs.xyz/api/sync",
              {
                method: "POST",
                body: JSON.stringify({ playlistId: playlist.id }),
                headers: { "Content-Type": "application/json" },
              },
            );

            await handleSync(mockRequest, env);
            successfulSyncs++;
          } catch (error) {
            failedSyncs++;
            console.error(`Failed to sync playlist ${playlist.id}:`, error);
            captureException(error, {
              extra: {
                playlistId: playlist.id,
              },
            });
          }
        }

        if (env.ANALYTICS) {
          writeMetric(env.ANALYTICS, {
            name: "playlist_sync_scheduled_success",
            value: successfulSyncs,
          });
          writeMetric(env.ANALYTICS, {
            name: "playlist_sync_scheduled_failure",
            value: failedSyncs,
          });
        }

        console.log(`Synced ${results.length} playlists`);
      } catch (error) {
        console.error("Error in scheduled sync:", error);
        captureException(error);
        if (env.ANALYTICS) {
          writeMetric(env.ANALYTICS, {
            name: "playlist_sync_scheduled_job_error",
            value: 1,
          });
        }
      }
    },
  } satisfies ExportedHandler<Env>,
);
