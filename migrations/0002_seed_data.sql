-- Seed data for the database

-- Turn on foreign keys for this session, as it's off by default in D1 migrations
PRAGMA foreign_keys=ON;

-- Users
-- Inserting two users: alice (id=1) and bob (id=2)
INSERT INTO users (id, username, email) VALUES (1, 'alice', 'alice@example.com');
INSERT INTO users (id, username, email) VALUES (2, 'bob', 'bob@example.com');

-- User Streaming Accounts
-- Using user IDs 1 and 2
INSERT INTO user_streaming_accounts (user_id, service, service_user_id, access_token, refresh_token, token_expires_at) VALUES
(1, 'spotify', 'alice_spotify', 'dummy_access_token_alice', 'dummy_refresh_token_alice', 1735689600), -- Expires in 2025
(2, 'spotify', 'bob_spotify', 'dummy_access_token_bob', 'dummy_refresh_token_bob', 1735689600);     -- Expires in 2025

-- Tracks by Vulfpeck
-- Using spotify_id for the service-specific ID
INSERT INTO tracks (id, name, artist, album, duration_ms, spotify_id) VALUES
(1, 'Back Pocket', 'Vulfpeck', 'Thrill of the Arts', 201000, '02B1YneY2roD8LkqhGch47'),
(2, '1612', 'Vulfpeck', 'Fugue State', 183000, '39lGn1p800Gog3fC23a685'),
(3, 'Dean Town', 'Vulfpeck', 'The Beautiful Game', 215000, '2a2a2HroS27S3sJaAU2u2I'),
(4, 'Animal Spirits', 'Vulfpeck', 'The Beautiful Game', 190000, '032zJcOwgnn4gSHa45wS7s'),
(5, 'Wait for the Moment', 'Vulfpeck', 'My First Car', 231000, '4D4oXX2y0i4wSRmR4a6mRt');

-- Playlists
-- Using owner_id to link to users table
INSERT INTO playlists (id, name, description, owner_id) VALUES
(1, 'Alice''s Vulfpeck Mix', 'A collection of Vulfpeck tunes.', 1),
(2, 'Bob''s Funky Beats', 'The funkiest of Vulfpeck.', 2);

-- Playlist Tracks (Junction Table)
-- Linking playlists and tracks with positions
-- Alice's Playlist (Playlist ID 1)
INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES
(1, 1, 1), -- Back Pocket
(1, 2, 2), -- 1612
(1, 4, 3); -- Animal Spirits

-- Bob's Playlist (Playlist ID 2)
INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES
(2, 3, 1), -- Dean Town
(2, 5, 2); -- Wait for the Moment

-- Playlist Links
-- Creating shareable links for the playlists
INSERT INTO playlist_links (playlist_id, user_id, service, service_playlist_id, is_source) VALUES
(1, 1, 'spotify', 'alice_spotify_playlist_1', 1),
(2, 2, 'spotify', 'bob_spotify_playlist_1', 1);