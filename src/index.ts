import { Hono } from "hono";
import { cors } from "hono/cors";
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
app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

export default {
  fetch: app.fetch,

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    console.log("Running scheduled sync job");

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
        } catch (error) {
          console.error(`Failed to sync playlist ${playlist.id}:`, error);
        }
      }

      console.log(`Synced ${results.length} playlists`);
    } catch (error) {
      console.error("Error in scheduled sync:", error);
    }
  },
} satisfies ExportedHandler<Env>;
