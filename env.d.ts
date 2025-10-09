import type { PlaylistService } from "./src/services/playlist-service";

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
}

export type HonoVariables = {
  playlistService: PlaylistService;
  jwtPayload: {
    userId: string;
  };
};

export type AppType = {
  Bindings: Env;
  Variables: HonoVariables;
};