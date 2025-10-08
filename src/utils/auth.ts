import { MiddlewareHandler } from "hono";
import { jwt } from "hono/jwt";
import type { JWTPayload } from "hono/utils/jwt/types";

/**
 * Define the structure of the JWT payload
 */
export interface AuthPayload extends JWTPayload {
  userId: number;
  exp: number; // Expiration time
}

/**
 * Create the JWT middleware
 * This will verify the token from the `Authorization: Bearer <token>` header
 */
export const authMiddleware: MiddlewareHandler<{
  Bindings: { JWT_SECRET: string };
}> = (c, next) => {
  const jwtMiddleware = jwt({
    secret: c.env.JWT_SECRET,
  });
  return jwtMiddleware(c, next);
};
