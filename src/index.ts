import { handleShare } from './api/share';
import { handleCreate } from './api/create';
import { handleSync } from './api/sync';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-User-Id',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route handling
      if (path === '/api/share' && request.method === 'POST') {
        const response = await handleShare(request, env);
        return addCorsHeaders(response, corsHeaders);
      }

      if (path === '/api/create' && request.method === 'POST') {
        const response = await handleCreate(request, env);
        return addCorsHeaders(response, corsHeaders);
      }

      if (path === '/api/sync' && request.method === 'POST') {
        const response = await handleSync(request, env);
        return addCorsHeaders(response, corsHeaders);
      }

      // Health check endpoint
      if (path === '/health') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 404 for unknown routes
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (error) {
      console.error('Unhandled error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  },

  /**
   * Scheduled handler for periodic sync jobs
   * Triggered by Cloudflare cron triggers
   */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Running scheduled sync job');

    // TODO: Implement logic to sync all playlists
    // Options:
    // 1. Sync all playlists that haven't been synced in X hours
    // 2. Sync playlists based on activity/priority
    // 3. Batch process to stay within CPU time limits

    // Example: Sync all playlists updated in the last 24 hours
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
          const mockRequest = new Request('https://synctape.ltrs.xyz/api/sync', {
            method: 'POST',
            body: JSON.stringify({ playlistId: playlist.id }),
            headers: { 'Content-Type': 'application/json' },
          });

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

/**
 * Helper to add CORS headers to a response
 */
function addCorsHeaders(response: Response, corsHeaders: Record<string, string>): Response {
  const newHeaders = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
