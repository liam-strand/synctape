import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { authMiddleware } from '../utils/auth';
import type { AuthPayload } from '../utils/auth';

const users = new Hono<{
  Bindings: {
    DB: D1Database;
    JWT_SECRET: string;
  };
  Variables: {
    jwtPayload: AuthPayload;
  };
}>();

/**
 * POST /api/users
 * Create a new user or log in an existing user
 */
users.post('/', async (c) => {
  const { email, username } = await c.req.json();

  if (!email || !username) {
    return c.json({ error: 'Email and username are required' }, 400);
  }

  try {
    // Check if user already exists
    let user = await c.env.DB.prepare('SELECT id, email, username FROM users WHERE email = ?')
      .bind(email)
      .first<{ id: number; email: string; username: string }>();

    if (!user) {
      // Create new user if they don't exist
      const { results } = await c.env.DB.prepare(
        'INSERT INTO users (email, username) VALUES (?, ?) RETURNING id, email, username'
      )
        .bind(email, username)
        .all();
      user = results[0] as { id: number; email: string; username: string };
    }

    // Issue a JWT
    const payload: AuthPayload = {
      userId: user.id,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // Expires in 24 hours
    };
    const token = await sign(payload, c.env.JWT_SECRET);

    return c.json({ token });
  } catch (e: any) {
    if (e.message.includes('UNIQUE constraint failed')) {
      return c.json({ error: 'Username or email already taken' }, 409);
    }
    console.error(e);
    return c.json({ error: 'An error occurred' }, 500);
  }
});

/**
 * GET /api/users/me
 * Get the authenticated user's profile
 */
users.get('/me', authMiddleware, async (c) => {
  const payload = c.get('jwtPayload');
  const userId = payload.userId;

  const user = await c.env.DB.prepare('SELECT id, email, username FROM users WHERE id = ?')
    .bind(userId)
    .first();

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json(user);
});

export default users;