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
- **user_refresh_tokens**: Stores hashed refresh tokens for JWT rotation

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
  users.ts                 # /api/users auth handlers (login, refresh, profile)

  utils/
  auth.ts                  # JWT Authentication utilities and middleware
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

### JWT Secrets

Synctape issues short-lived access tokens and longer-lived refresh tokens. Two secrets are required:

- `JWT_SECRET`: Signs access tokens (15 minute TTL).
- `JWT_REFRESH_SECRET`: Signs refresh tokens (14 day TTL). Defaults to `JWT_SECRET` if unset, but you should set a distinct value in production.

Generate strong secrets with:

```bash
openssl rand -base64 32
```

Configure the variables in the Cloudflare dashboard (Worker **Settings → Variables**) or via `wrangler secret put`.

Refresh tokens are hashed and persisted in the `user_refresh_tokens` table to support rotation and revocation.

### Spotify OAuth

Synctape now supports connecting Spotify accounts through the Worker. Configure the following variables:

- `SPOTIFY_CLIENT_ID` (string, already included in `wrangler.jsonc`)
- `SPOTIFY_CLIENT_SECRET` (secret value set via `wrangler secret put`)

**Connect flow**

1. Authenticate the user and request `GET /api/spotify/oauth-url` with their bearer token. Optionally pass `?returnTo=/your/path` to control the post-connection redirect.
2. The response returns a one-time Worker URL. Redirect the user's browser to it to kick off OAuth.
3. The Worker forwards the user to Spotify's consent screen and handles the `/auth/spotify/callback` exchange.
4. Access and refresh tokens are stored in `user_streaming_accounts`. Tokens are automatically refreshed on demand when other APIs ask for Spotify access.

If the optional `returnTo` parameter is omitted, the user is redirected to `/connect/spotify/success` on the Worker origin once the flow completes. The Spotify developer dashboard must list `https://synctape.ltrs.xyz/auth/spotify/callback` as an allowed redirect URI.

## TODO / Stubbed Features

- [ ] **Authentication**: Implement proper OAuth flows for user authentication
- [ ] **Streaming Service APIs**: Complete Spotify, Apple Music, and YouTube Music API integrations
- [ ] **Track Matching**: Implement fuzzy matching for tracks not found by ISRC
- [ ] **Service-specific Track IDs**: Update API responses to include track IDs from services
- [x] **Token Refresh**: Implement OAuth token refresh logic (Spotify)
- [ ] **Rate Limiting**: Add rate limiting to respect API quotas
- [ ] **Webhooks**: Add support for playlist change webhooks from services
- [x] **User Management**: Add user registration and profile management
- [ ] **Permissions**: Implement role-based access control for playlists

## Development Notes

### Authentication

Authentication uses JWT bearer tokens. Call `POST /api/users` to log in or register and receive an access/refresh token pair. Send the access token in the `Authorization: Bearer <token>` header for all protected endpoints. Refresh tokens can be exchanged at `POST /api/users/refresh` and revoked with `POST /api/users/logout`.

Tokens are verified with the `utils/auth.ts` middleware, which enforces expiry, token type, and user binding.

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
