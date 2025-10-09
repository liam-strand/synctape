// Shared TypeScript types

export type StreamingServiceType = "spotify" | "apple_music" | "youtube_music";

export interface TrackMetadata {
  id: string; // The service-specific track ID
  name: string;
  artist: string;
  album: string;
  isrc?: string;
  duration_ms?: number;
  image_url?: string;
}

export interface PlaylistData {
  name: string;
  description: string;
  tracks: TrackMetadata[];
  updatedAt: Date;
}

export interface Track {
  id: number;
  name: string;
  artist: string;
  album: string;
  isrc?: string;
  duration_ms?: number;
  spotify_id?: string;
  apple_music_id?: string;
  youtube_music_id?: string;
  last_verified: number;
  created_at: number;
}

export interface Playlist {
  id: number;
  name: string;
  description?: string;
  owner_id: number;
  created_at: number;
  updated_at: number;
  last_synced_at?: number;
}

export interface PlaylistTrack {
  id: number;
  playlist_id: number;
  track_id: number;
  position: number;
  added_at: number;
}

export interface User {
  id: number;
  username: string;
  email: string;
  created_at: number;
}

export interface UserStreamingAccount {
  id: number;
  user_id: number;
  service: StreamingServiceType;
  service_user_id: string;
  access_token: string;
  refresh_token?: string;
  token_expires_at?: number;
  created_at: number;
}

export interface PlaylistLink {
  id: number;
  playlist_id: number;
  user_id: number;
  service: StreamingServiceType;
  service_playlist_id: string;
  is_source: boolean;
  last_synced_at?: number;
  created_at: number;
}
