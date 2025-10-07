import { env, fetch } from 'miniflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { sign } from 'hono/jwt';

describe('User API', () => {
  beforeEach(async () => {
    // Reset the database before each test
    await env.DB.exec('DELETE FROM users');
  });

  describe('POST /api/users', () => {
    it('should create a new user and return a token', async () => {
      const response = await fetch('http://localhost/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          username: 'testuser',
        }),
      });

      const body = await response.json<{ token: string }>();
      expect(response.status).toBe(200);
      expect(body.token).toBeDefined();

      // Verify the user was created in the database
      const user = await env.DB.prepare(
        'SELECT * FROM users WHERE email = ?'
      )
        .bind('test@example.com')
        .first();
      expect(user).not.toBeNull();
      expect(user?.username).toBe('testuser');
    });

    it('should return a token for an existing user', async () => {
      // First, create the user
      await env.DB.prepare(
        'INSERT INTO users (email, username) VALUES (?, ?)'
      )
        .bind('existing@example.com', 'existinguser')
        .run();

      const response = await fetch('http://localhost/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'existing@example.com',
          username: 'existinguser',
        }),
      });

      const body = await response.json<{ token: string }>();
      expect(response.status).toBe(200);
      expect(body.token).toBeDefined();
    });

    it('should return 400 if email or username is missing', async () => {
      const response = await fetch('http://localhost/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/users/me', () => {
    it("should return the authenticated user's profile", async () => {
      // Create a user and a token for them
      const { results } = await env.DB.prepare(
        'INSERT INTO users (email, username) VALUES (?, ?) RETURNING id'
      )
        .bind('me@example.com', 'me_user')
        .all();
      const userId = results[0].id;

      const token = await sign({ userId, exp: Math.floor(Date.now() / 1000) + 60 * 5 }, env.JWT_SECRET);

      const response = await fetch('http://localhost/api/users/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.id).toBe(userId);
      expect(body.email).toBe('me@example.com');
      expect(body.username).toBe('me_user');
    });

    it('should return 401 if no token is provided', async () => {
      const response = await fetch('http://localhost/api/users/me');
      expect(response.status).toBe(401);
    });

    it('should return 401 if the token is invalid', async () => {
      const response = await fetch('http://localhost/api/users/me', {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      expect(response.status).toBe(401);
    });
  });
});