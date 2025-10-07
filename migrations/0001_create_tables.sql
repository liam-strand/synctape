-- Migration number: 0001 	 2025-10-07T00:00:00.000Z

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- User streaming accounts (OAuth tokens for each service)
CREATE TABLE IF NOT EXISTS user_streaming_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    service TEXT NOT NULL, -- 'spotify', 'apple_music', etc.
    service_user_id TEXT NOT NULL,
    access_token TEXT NOT NULL, -- Should be encrypted in production
    refresh_token TEXT,
    token_expires_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, service)
);

-- Tracks table with service-specific IDs
CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT NOT NULL,
    isrc TEXT, -- International Standard Recording Code
    duration_ms INTEGER,
    spotify_id TEXT,
    apple_music_id TEXT,
    youtube_music_id TEXT,
    last_verified INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Create index on ISRC for faster track matching
CREATE INDEX IF NOT EXISTS idx_tracks_isrc ON tracks(isrc);

-- Playlists table
CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    owner_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    last_synced_at INTEGER,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Junction table for playlist tracks (maintains order)
CREATE TABLE IF NOT EXISTS playlist_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    track_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    added_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
    UNIQUE(playlist_id, track_id),
    UNIQUE(playlist_id, position)
);

-- Links between our playlists and service playlists
CREATE TABLE IF NOT EXISTS playlist_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    service TEXT NOT NULL, -- 'spotify', 'apple_music', etc.
    service_playlist_id TEXT NOT NULL,
    is_source INTEGER NOT NULL DEFAULT 0, -- Boolean: was this the original shared playlist?
    last_synced_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(playlist_id, service, service_playlist_id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_links_playlist ON playlist_links(playlist_id);
CREATE INDEX IF NOT EXISTS idx_user_streaming_accounts_user ON user_streaming_accounts(user_id);
