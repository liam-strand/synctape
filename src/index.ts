import { renderHtml } from "./renderHtml";
import { synchronizePlaylist } from "./sync";
import { Env, Playlist, Track } from "./types";

const handleApiRequest = async (pathname: string, request: Request, env: Env) => {
  // Improved routing
  if (pathname === '/api/playlists') {
    if (request.method === 'POST') {
      const body: Partial<Playlist> = await request.json();
      const { name, spotify_id, apple_music_id } = body;

      if (!name) {
        return new Response(JSON.stringify({ error: 'Playlist name is required' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      try {
        const stmt = env.DB.prepare(
          'INSERT INTO playlists (name, spotify_id, apple_music_id) VALUES (?, ?, ?)'
        ).bind(name, spotify_id || null, apple_music_id || null);
        await stmt.run();

        return new Response(JSON.stringify({ message: 'Playlist created successfully' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 201,
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
          headers: { 'Content-Type': 'application/json' },
          status: 500,
        });
      }
    }

    if (request.method === 'GET') {
      const stmt = env.DB.prepare('SELECT * FROM playlists');
      const { results } = await stmt.all<Playlist>();
      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const playlistIdMatch = pathname.match(/^\/api\/playlists\/(\d+)$/);
  if (playlistIdMatch) {
    const id = playlistIdMatch[1];
    if (request.method === 'GET') {
      const stmt = env.DB.prepare('SELECT * FROM playlists WHERE id = ?').bind(id);
      const { results } = await stmt.all<Playlist>();
      if (results.length === 0) {
        return new Response(JSON.stringify({ error: 'Playlist not found' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 404,
        });
      }
      return new Response(JSON.stringify(results[0]), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const tracksMatch = pathname.match(/^\/api\/playlists\/(\d+)\/tracks$/);
  if (tracksMatch) {
    const playlistId = tracksMatch[1];
    if (request.method === 'POST') {
      const body: Partial<Track> = await request.json();
      const { title, artist, album, spotify_id, apple_music_id } = body;
      if (!title || !artist) {
        return new Response(JSON.stringify({ error: 'Track title and artist are required' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400,
        });
      }
      try {
        const stmt = env.DB.prepare(
          'INSERT INTO tracks (playlist_id, title, artist, album, spotify_id, apple_music_id) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(Number(playlistId), title, artist, album || null, spotify_id || null, apple_music_id || null);
        await stmt.run();
        return new Response(JSON.stringify({ message: 'Track added successfully' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 201,
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
          headers: { 'Content-Type': 'application/json' },
          status: 500,
        });
      }
    }
    if (request.method === 'GET') {
      const stmt = env.DB.prepare('SELECT * FROM tracks WHERE playlist_id = ?').bind(Number(playlistId));
      const { results } = await stmt.all<Track>();
      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const syncMatch = pathname.match(/^\/api\/playlists\/(\d+)\/sync$/);
  if (syncMatch && request.method === 'POST') {
    const playlistId = syncMatch[1];
    try {
      await synchronizePlaylist(playlistId, env);
      return new Response(JSON.stringify({ message: 'Playlist synchronized successfully' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    headers: { 'Content-Type': 'application/json' },
    status: 404,
  });
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith('/api/')) {
      return handleApiRequest(pathname, request, env);
    }

    // Serve the HTML page for the root path
    const stmt = env.DB.prepare('SELECT * FROM comments LIMIT 3');
    const { results } = await stmt.all();

    return new Response(renderHtml(JSON.stringify(results, null, 2)), {
      headers: {
        'content-type': 'text/html',
      },
    });
  },
} satisfies ExportedHandler<Env>;