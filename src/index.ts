import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handleShare } from './api/share';
import { handleCreate } from './api/create';
import { handleSync } from './api/sync';
import users from './api/users';

// Define the Hono app
const app = new Hono<{ Bindings: Env }>();

// Setup CORS middleware
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'X-User-Id', 'Authorization'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
  })
);

// API routes
app.post('/api/share', (c) => handleShare(c.req.raw, c.env));
app.post('/api/create', (c) => handleCreate(c.req.raw, c.env));
app.post('/api/sync', (c) => handleSync(c.req.raw, c.env));
app.route('/api/users', users);

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

export default {
  fetch: app.fetch,

  /**
   * Scheduled handler for periodic sync jobs
   * Triggered by Cloudflare cron triggers
   */
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log('Running scheduled sync job');

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
          // Create a mock request for handleSync
          const mockRequest = new Request(
            'https://synctape.ltrs.xyz/api/sync',
            {
              method: 'POST',
              body: JSON.stringify({ playlistId: playlist.id }),
              headers: { 'Content-Type': 'application/json' },
            }
          );

          await handleSync(mockRequest, env);
        } catch (error) {
          console.error(`Failed to sync playlist ${playlist.id}:`, error);
        }
      }

      console.log(`Synced ${results.length} playlists`);
    } catch (error) {
      console.error('Error in scheduled sync:', error);
    }
  },
} satisfies ExportedHandler<Env>;
