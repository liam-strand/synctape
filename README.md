# Synctape

A collaborative playlist app that allows people to sync playlists across different music streaming services (Spotify, Apple Music, YouTube Music, etc.).

## Architecture

### Database Tables

- **users**: User accounts
- **user_streaming_accounts**: OAuth tokens for each user's connected streaming services
- **tracks**: Track metadata with service-specific IDs (spotify_id, apple_music_id, etc.)
- **playlists**: Playlist metadata
- **playlist_tracks**: Junction table maintaining track order in playlists
- **playlist_links**: Links between our playlists and service-specific playlist IDs

### API Endpoints

#### POST /api/share
Takes a link to an existing playlist on a streaming service and loads it into the database.

**Request:**
```json
{
  "service": "spotify",
  "playlistId": "37i9dQZF1DXcBWIGoYBM5M"
}
```

**Response:**
```json
{
  "playlistId": 1,
  "name": "My Playlist",
  "trackCount": 50
}
```

**Features:**
- Idempotent (calling multiple times won't create duplicates)
- Creator becomes the owner of the playlist
- Original playlist is marked as source

#### POST /api/create
Creates a playlist on the specified streaming service and syncs it with our database playlist.

**Request:**
```json
{
  "playlistId": 1,
  "service": "apple_music"
}
```

**Response:**
```json
{
  "success": true,
  "servicePlaylistId": "pl.u-abc123",
  "trackCount": 45,
  "skippedTracks": 5
}
```

**Features:**
- Only creates on the requested service
- Skips tracks not available on the target service
- Links the service playlist to our database

#### POST /api/sync
Syncs a playlist across all linked streaming services.

**Request:**
```json
{
  "playlistId": 1
}
```

**Response:**
```json
{
  "success": true,
  "trackCount": 50,
  "syncedServices": ["spotify", "apple_music"],
  "errors": []
}
```

**Sync Strategy:**
- Uses last-write-wins based on `last_synced_at` timestamps
- Fetches latest from all services
- Determines most recent version
- Updates database
- Propagates to all other services

### Cron Job

The `/api/sync` endpoint is also triggered automatically every 30 minutes via Cloudflare Cron Triggers to keep playlists in sync.

## Project Structure

```
src/
  index.ts                    # Main Worker entry point with routing
  
  services/
    StreamingService.ts       # Interface definition
    SpotifyService.ts         # Spotify implementation (stubbed)
    AppleMusicService.ts      # Apple Music implementation (stubbed)
    ServiceFactory.ts         # Factory to get service by name
  
  db/
    queries.ts               # D1 database query utilities
  
  api/
    share.ts                 # /api/share handler
    create.ts                # /api/create handler
    sync.ts                  # /api/sync handler
    users.ts                 # /api/users and /api/users/me handlers
  
  utils/
    auth.ts                  # JWT Authentication middleware
    trackMatching.ts         # Track matching logic
    types.ts                 # Shared TypeScript types

migrations/
  0001_create_comments_table.sql  # Database schema
```

## Getting Started

### Prerequisites

- Node.js and pnpm
- Cloudflare account with Workers and D1 enabled
- Wrangler CLI

### Setup

1. Install dependencies:
```bash
pnpm install
```

2. Apply database migrations:
```bash
pnpm run seedLocalD1
```

3. Run locally:
```bash
pnpm run dev
```

4. Deploy to Cloudflare:
```bash
pnpm run deploy
```

### JWT Secret

This project uses JSON Web Tokens (JWT) for user authentication. A secret key is required to sign and verify these tokens. A default, insecure key is provided in `wrangler.json` for local development.

For production, you **must** generate a strong, unique secret. You can generate a secure secret using the following command:

```bash
openssl rand -base64 32
```

Once you have your secret, you need to set it as an environment variable in your Cloudflare Worker's settings.

1. Go to your Worker in the Cloudflare dashboard.
2. Navigate to **Settings** > **Variables**.
3. Under **Environment Variables**, click **Add variable**.
4. Set the variable name to `JWT_SECRET` and paste your generated secret as the value.
5. Make sure to **Encrypt** the secret for security.
6. Click **Save**.

## TODO / Stubbed Features

- [ ] **Authentication**: Implement proper OAuth flows for user authentication
- [ ] **Streaming Service APIs**: Complete Spotify, Apple Music, and YouTube Music API integrations
- [ ] **Track Matching**: Implement fuzzy matching for tracks not found by ISRC
- [ ] **Service-specific Track IDs**: Update API responses to include track IDs from services
- [ ] **Token Refresh**: Implement OAuth token refresh logic
- [ ] **Rate Limiting**: Add rate limiting to respect API quotas
- [ ] **Webhooks**: Add support for playlist change webhooks from services
- [x] **User Management**: Add user registration and profile management
- [ ] **Permissions**: Implement role-based access control for playlists

## Development Notes

### Authentication

Authentication is handled via JSON Web Tokens (JWT). Users can register and log in via the `/api/users` endpoint to receive a token. This token must be sent in the `Authorization: Bearer <token>` header for all protected endpoints.

The JWT implementation uses the `hono/jwt` library and is configured with a `JWT_SECRET` environment variable.

### Track Matching

Track matching currently works by:
1. Checking service-specific ID
2. Falling back to ISRC matching
3. Creating a new track if not found

Future improvements:
- Fuzzy matching by name/artist/album
- Using multiple metadata sources
- Machine learning for better matching

### Database Seeding

The local D1 database can be seeded with sample data for development and testing. The seed data includes two users (`alice` and `bob`), playlists, and tracks by Vulfpeck.

To seed the database, run the following command:
```bash
pnpm run seedLocalD1
```
This command applies all migrations, including the seed data migration file.

### Rate Limiting

Streaming service APIs have rate limits. Consider:
- Batching operations
- Implementing exponential backoff
- Caching frequently accessed data
- Using service webhooks when available

## License

MIT
