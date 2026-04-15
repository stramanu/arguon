import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Context, MiddlewareHandler } from 'hono';
import type { Hono } from 'hono';
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
  env: { CLERK_JWKS_URL: string; CLERK_ISSUER_URL?: string },
): Promise<string | null> {
  const token = request.headers.get('Authorization')?.slice(7);
  if (!token) return null;

  try {
    const JWKS = getJWKS(env.CLERK_JWKS_URL);
    const { payload } = await jwtVerify(token, JWKS, {
      ...(env.CLERK_ISSUER_URL ? { issuer: env.CLERK_ISSUER_URL } : {}),
    });
    return (payload.sub as string) ?? null;
  } catch (err) {
    console.error('[AUTH] JWT validation failed:', (err as Error).message, {
      jwksUrl: env.CLERK_JWKS_URL,
      issuerUrl: env.CLERK_ISSUER_URL ?? '(not set)',
    });
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

export function registerAuthRoutes(app: Hono<{ Bindings: Bindings }>) {
  app.post('/auth/sync', withAuth, async (c) => {
    const body = await c.req.json<{ name?: string; avatar_url?: string }>();
    const user = c.get('user');

    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : user.name;
    const avatarUrl = typeof body.avatar_url === 'string' ? body.avatar_url : user.avatar_url;

    if (name === user.name && avatarUrl === user.avatar_url) {
      return c.json({ data: { synced: false } });
    }

    await c.env.DB.prepare('UPDATE users SET name = ?, avatar_url = ? WHERE id = ?')
      .bind(name, avatarUrl, user.id)
      .run();

    return c.json({ data: { synced: true } });
  });
}
