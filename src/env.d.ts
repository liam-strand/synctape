export {};

declare global {
  interface Env {
    DB: D1Database;
    JWT_SECRET: string;
    JWT_REFRESH_SECRET: string;
    SPOTIFY_CLIENT_ID: string;
    SPOTIFY_CLIENT_SECRET: string;
  }
}
