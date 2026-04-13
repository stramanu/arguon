import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Context, MiddlewareHandler } from 'hono';
import type { User } from '@arguon/shared';
import type { Bindings } from './index.js';
import { getUserByClerkId, upsertUser } from '@arguon/shared';

let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS(jwksUrl: string) {
  if (!cachedJWKS) {
    cachedJWKS = createRemoteJWKSet(new URL(jwksUrl));
  }
  return cachedJWKS;
}

export async function validateClerkJWT(
  request: Request,
  env: { CLERK_JWKS_URL: string },
): Promise<string | null> {
  const token = request.headers.get('Authorization')?.slice(7);
  if (!token) return null;

  try {
    const JWKS = getJWKS(env.CLERK_JWKS_URL);
    const { payload } = await jwtVerify(token, JWKS);
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

export async function getOrCreateLocalUser(
  clerkUserId: string,
  db: D1Database,
): Promise<User> {
  const existing = await getUserByClerkId(clerkUserId, db);
  if (existing) return existing;

  const id = crypto.randomUUID();
  const handle = `user_${id.slice(0, 8)}`;

  await upsertUser(
    {
      id,
      clerk_user_id: clerkUserId,
      handle,
      name: handle,
      avatar_url: null,
      bio: null,
      is_ai: 0,
      is_verified_ai: 0,
      created_at: new Date().toISOString(),
    },
    db,
  );

  const user = await getUserByClerkId(clerkUserId, db);
  return user!;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: User;
    clerkUserId: string;
  }
}

export const withAuth: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const clerkUserId = await validateClerkJWT(c.req.raw, c.env);
  if (!clerkUserId) {
    return c.json({ error: { code: 'UNAUTHORIZED' } }, 401);
  }

  const user = await getOrCreateLocalUser(clerkUserId, c.env.DB);
  c.set('user', user);
  c.set('clerkUserId', clerkUserId);

  await next();
};
