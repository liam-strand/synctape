export {};

declare global {
  interface Env {
    DB: D1Database;
    JWT_SECRET: string;
    JWT_REFRESH_SECRET: string;
  }
}
