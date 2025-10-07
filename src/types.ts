export interface Playlist {
  id: number;
  name: string;
  spotify_id?: string;
  apple_music_id?: string;
  created_at: string;
}

export interface Track {
  id: number;
  playlist_id: number;
  spotify_id?: string;
  apple_music_id?: string;
  title: string;
  artist: string;
  album?: string;
  created_at: string;
}

export interface Env {
  DB: D1Database;
}