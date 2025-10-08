# Synctape API Documentation

## Authentication

All API endpoints that require authentication must include a JSON Web Token (JWT) in the `Authorization` header.

JWT tokens are short-lived (15 minutes). Use the refresh workflow to obtain new access tokens without forcing a full login.

**Example:**

```bash
curl -X POST https://synctape.ltrs.xyz/api/share \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_JWT>" \
  -d '{"service":"spotify","playlistId":"37i9dQZF1DXcBWIGoYBM5M"}'
```

To obtain a JWT, you must register or log in using the `/api/users` endpoint.

## Endpoints

### POST /api/users

Creates a new user or logs in an existing user. If the user's email already exists, they will be logged in. Otherwise, a new user will be created. Returns a token pair.

**Request Body:**

```typescript
{
  email: string;
  username: string;
}
```

**Response (200 OK):**

```typescript
{
  accessToken: string;
  accessTokenExpiresIn: number; // seconds
  refreshToken: string;
  refreshTokenExpiresAt: number; // epoch seconds
}
```

**Error Responses:**

- `400 Bad Request`: Missing `email` or `username`.
- `409 Conflict`: The `username` is already taken.

**Example:**

```bash
curl -X POST https://synctape.ltrs.xyz/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser"
  }'
```

---

### POST /api/users/refresh

Exchanges a valid refresh token for a new access/refresh token pair. Refresh tokens are single-use and rotated automatically.

**Request Body:**

```typescript
{
  refreshToken: string;
}
```

**Response (200 OK):**

```typescript
{
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
}
```

**Error Responses:**

- `400 Bad Request`: Missing refresh token.
- `401 Unauthorized`: Refresh token expired, revoked, or invalid.

**Example:**

```bash
curl -X POST https://synctape.ltrs.xyz/api/users/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<REFRESH_TOKEN>"
  }'
```

---

### POST /api/users/logout

Revokes a refresh token.

**Request Body:**

```typescript
{
  refreshToken: string;
}
```

**Response (200 OK):**

```typescript
{
  success: true;
}
```

**Error Responses:**

- `400 Bad Request`: Missing or invalid refresh token.

---

### GET /api/users/config/token

Returns current access and refresh token TTL configuration (seconds). Useful for clients to plan refresh scheduling.

**Response (200 OK):**

```typescript
{
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
}
```

---

### GET /api/users/me

Retrieves the profile of the currently authenticated user.

**Request Headers:**

- `Authorization: Bearer <YOUR_JWT>`

**Response (200 OK):**

```typescript
{
  id: number;
  email: string;
  username: string;
}
```

**Error Responses:**

- `401 Unauthorized`: Missing or invalid JWT.
- `404 Not Found`: The user associated with the token could not be found.

**Example:**

```bash
curl https://synctape.ltrs.xyz/api/users/me \
  -H "Authorization: Bearer <YOUR_JWT>"
```

---

### GET /api/spotify/oauth-url

Generates a signed one-time URL that starts the Spotify OAuth flow for the authenticated user.

**Query Parameters:**

- `returnTo` (optional): Relative path to redirect the user to after the connection completes. Defaults to `/connect/spotify/success`.

**Headers:**

- `Authorization: Bearer <YOUR_JWT>`

**Response (200 OK):**

```typescript
{
  url: string; // Worker URL that redirects to Spotify's authorize page
}
```

Clients should redirect the browser to the returned `url`. The Worker validates the OAuth state and forwards the user to Spotify.

---

### GET /auth/spotify

Internal redirect endpoint invoked by the URL returned from `/api/spotify/oauth-url`. Validates the OAuth `state` parameter and forwards the user to Spotify's consent page.

---

### GET /auth/spotify/callback

Spotify's redirect URI. Exchanges the authorization code for tokens, fetches the Spotify profile, and stores/updates credentials in `user_streaming_accounts`. On success, the user is redirected to the `returnTo` path captured in the OAuth state (defaults to `/connect/spotify/success`). Your Spotify app configuration must list `https://synctape.ltrs.xyz/auth/spotify/callback` as an allowed redirect URI.

---

### POST /api/share

Import a playlist from a streaming service into Synctape.

**Request Body:**

```typescript
{
  service: "spotify" | "apple_music" | "youtube_music";
  playlistId: string;  // Service-specific playlist ID
  playlistUrl?: string; // Optional full URL (can parse from this instead)
}
```

**Response (200 OK):**

```typescript
{
  playlistId: number; // Internal Synctape playlist ID
  name: string;
  trackCount: number;
}
```

**Error Responses:**

- `400 Bad Request`: Missing required fields
- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: User hasn't connected their account for this service
- `500 Internal Server Error`: Service API failure

**Example:**

```bash
curl -X POST https://synctape.ltrs.xyz/api/share \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_JWT>" \
  -d '{
    "service": "spotify",
    "playlistId": "37i9dQZF1DXcBWIGoYBM5M"
  }'
```

**Notes:**

- This endpoint is idempotent
- The requesting user becomes the owner of the imported playlist
- The source playlist is marked in the database

---

### POST /api/create

Create a playlist on a streaming service from a Synctape playlist.

**Request Body:**

```typescript
{
  playlistId: number; // Internal Synctape playlist ID
  service: "spotify" | "apple_music" | "youtube_music";
}
```

**Response (200 OK):**

```typescript
{
  success: true;
  servicePlaylistId: string; // ID on the streaming service
  trackCount: number; // Number of tracks added
  skippedTracks: number; // Tracks not available on this service
}
```

**Error Responses:**

- `400 Bad Request`: Missing required fields
- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: User hasn't connected their account for this service
- `404 Not Found`: Playlist doesn't exist
- `409 Conflict`: Playlist already exists on this service for this user
- `500 Internal Server Error`: Service API failure

**Example:**

```bash
curl -X POST https://synctape.ltrs.xyz/api/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_JWT>" \
  -d '{
    "playlistId": 42,
    "service": "apple_music"
  }'
```

**Notes:**

- Only creates on the specified service
- Tracks not available on the service are skipped
- A link is created between the Synctape playlist and service playlist

---

### POST /api/sync

Synchronize a playlist across all linked streaming services.

**Request Body:**

```typescript
{
  playlistId: number; // Internal Synctape playlist ID
}
```

**Response (200 OK):**

```typescript
{
  success: true;
  trackCount: number;  // Total tracks after sync
  syncedServices: string[];  // Services successfully synced
  errors?: Array<{  // Optional: services that failed
    service: string;
    error: string;
  }>;
}
```

**Error Responses:**

- `400 Bad Request`: Missing required field or no linked services
- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: Playlist belongs to another user
- `404 Not Found`: Playlist doesn't exist
- `500 Internal Server Error`: All services failed to sync

**Example:**

```bash
curl -X POST https://synctape.ltrs.xyz/api/sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_JWT>" \
  -d '{
    "playlistId": 42
  }'
```

**Notes:**

- Uses last-write-wins strategy based on `last_synced_at` timestamps
- Fetches from all linked services, determines most recent
- Updates database with latest version
- Propagates changes to all other linked services
- Partial failures are reported in the `errors` array

**Sync Strategy:**

1. Fetch playlist from all linked services
2. Compare `last_synced_at` timestamps
3. Use the most recently updated version as source
4. Update Synctape database
5. Push changes to all other services

---

### GET /health

Health check endpoint.

**Response (200 OK):**

```typescript
{
  status: "ok";
}
```

**Example:**

```bash
curl https://synctape.ltrs.xyz/health
```

---

## Cron Triggers

The `/api/sync` endpoint is automatically called every 30 minutes by Cloudflare Cron Triggers to keep all playlists synchronized.

**Current Strategy:**

- Syncs playlists that haven't been synced in the last 24 hours
- Processes up to 100 playlists per cron run
- Runs every 30 minutes

---

## Streaming Service Support

### Supported Services

- Spotify (stubbed)
- Apple Music (stubbed)
- YouTube Music (planned)

### Service-Specific Notes

#### Spotify

- Uses Spotify Web API
- Requires OAuth 2.0 authentication
- Rate limit: ~180 requests per minute
- Track IDs are in format: `spotify:track:ID` or just `ID`

#### Apple Music

- Uses Apple Music API
- Requires Apple Music subscription and developer token
- Rate limits vary by endpoint
- Track IDs are in format: `i.123456`

#### YouTube Music

- Not yet implemented
- Will use YouTube Music API or ytmusicapi

---

## Error Handling

All endpoints return JSON error responses:

```typescript
{
  error: string;  // Human-readable error message
  details?: any;  // Optional additional error details
}
```

**Common HTTP Status Codes:**

- `200 OK`: Success
- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource doesn't exist
- `409 Conflict`: Resource already exists
- `500 Internal Server Error`: Server-side error

---

## CORS

All endpoints support CORS with the following headers:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

---

## Rate Limits

Currently no rate limits are enforced on the Synctape API. Future versions will implement:

- Per-user rate limiting
- IP-based rate limiting
- Graceful handling of streaming service rate limits

---

## Future Endpoints (Planned)

### GET /api/users

List all users (admin only, future).

### GET /api/playlists

List all playlists for the authenticated user.

### GET /api/playlist/:id

Get details about a specific playlist.

### DELETE /api/playlist/:id

Delete a playlist (owner only).

### POST /api/playlist/:id/tracks

Add tracks to a playlist.

### DELETE /api/playlist/:id/tracks

Remove tracks from a playlist.

### GET /api/search

Search for tracks across services.
