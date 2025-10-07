/**
 * Authentication utilities (stubbed for now)
 */

export interface AuthContext {
  userId: number;
  username: string;
}

/**
 * Extract and validate authentication from request
 * TODO: Implement proper authentication (JWT, OAuth, etc.)
 */
export async function authenticateRequest(request: Request): Promise<AuthContext | null> {
  // STUB: For now, check for a simple header
  const authHeader = request.headers.get('X-User-Id');
  
  if (!authHeader) {
    return null;
  }

  const userId = parseInt(authHeader, 10);
  
  if (isNaN(userId)) {
    return null;
  }

  // TODO: Validate the user exists in the database
  // TODO: Implement proper token validation
  
  return {
    userId,
    username: 'stub_user', // TODO: Get from database
  };
}

/**
 * Get OAuth access token for a user's streaming service
 * TODO: Implement token refresh logic
 */
export async function getAccessToken(
  db: D1Database,
  userId: number,
  service: string
): Promise<string | null> {
  // STUB: Query the user_streaming_accounts table
  const result = await db
    .prepare('SELECT access_token, token_expires_at FROM user_streaming_accounts WHERE user_id = ? AND service = ?')
    .bind(userId, service)
    .first<{ access_token: string; token_expires_at?: number }>();

  if (!result) {
    return null;
  }

  // TODO: Check if token is expired and refresh if needed
  // if (result.token_expires_at && result.token_expires_at < Date.now() / 1000) {
  //   return await refreshAccessToken(db, userId, service);
  // }

  return result.access_token;
}

/**
 * Require authentication or throw error
 */
export async function requireAuth(request: Request): Promise<AuthContext> {
  const auth = await authenticateRequest(request);
  
  if (!auth) {
    throw new Error('Unauthorized');
  }

  return auth;
}
