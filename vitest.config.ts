import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'miniflare',
    // Configuration for the Miniflare test environment
    environmentOptions: {
      // We can define bindings, KV namespaces, D1 databases, etc. here
      env: {
        JWT_SECRET: 'a-secure-secret-key-that-is-at-least-32-characters-long',
      },
      d1Databases: ['DB'],
      // We can also specify a script path to the worker
      scriptPath: './src/index.ts',
    },
  },
});