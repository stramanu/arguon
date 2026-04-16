import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Context, MiddlewareHandler } from 'hono';
import type { Hono } from 'hono';
import type { User } from '@arguon/shared';
import type { Bindings } from './index.js';
import { getUserByClerkId, getUserByHandle, upsertUser, updateUser, getUserTopicPreferences, setUserTopicPreferences } from '@arguon/shared';
import { userTopicPreferencesBody, updateProfileBody, handleAvailableQuery } from './schemas.js';
import { parseBody, parseQuery } from './validate.js';

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
  // --- Clerk → local DB sync (respects name_source) ---
  app.post('/auth/sync', withAuth, async (c) => {
    const body = await c.req.json<{ name?: string; avatar_url?: string }>();
    const user = c.get('user');

    // Only overwrite name if the user hasn't set a custom one
    const shouldSyncName = user.name_source !== 'custom';
    const name = shouldSyncName && typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : user.name;
    const avatarUrl = typeof body.avatar_url === 'string' ? body.avatar_url : user.avatar_url;

    if (name === user.name && avatarUrl === user.avatar_url) {
      return c.json({ data: { synced: false } });
    }

    await c.env.DB.prepare('UPDATE users SET name = ?, avatar_url = ? WHERE id = ?')
      .bind(name, avatarUrl, user.id)
      .run();

    return c.json({ data: { synced: true } });
  });

  // --- Handle availability check (public-ish, still requires auth to prevent abuse) ---
  app.get('/auth/handle-available', withAuth, async (c) => {
    const query = parseQuery(handleAvailableQuery, c.req.query(), c);
    if (query instanceof Response) return query;

    const existing = await getUserByHandle(query.handle, c.env.DB);
    const available = !existing || existing.id === c.get('user').id;
    return c.json({ available });
  });

  // --- Update own profile (handle and/or name) ---
  app.patch('/auth/me', withAuth, async (c) => {
    const body = parseBody(updateProfileBody, await c.req.json(), c);
    if (body instanceof Response) return body;

    const user = c.get('user');
    const fields: Record<string, string> = {};

    if (body.handle !== undefined && body.handle !== user.handle) {
      const existing = await getUserByHandle(body.handle, c.env.DB);
      if (existing && existing.id !== user.id) {
        return c.json({ error: { code: 'HANDLE_TAKEN', message: 'This handle is already taken' } }, 409);
      }
      fields.handle = body.handle;
    }

    if (body.name !== undefined && body.name !== user.name) {
      fields.name = body.name;
      fields.name_source = 'custom';
    }

    if (Object.keys(fields).length === 0) {
      return c.json({ data: { handle: user.handle, name: user.name } });
    }

    await updateUser(user.id, fields, c.env.DB);
    return c.json({ data: { handle: fields.handle ?? user.handle, name: fields.name ?? user.name } });
  });

  app.get('/auth/me/preferences', withAuth, async (c) => {
    const user = c.get('user');
    const topics = await getUserTopicPreferences(user.id, c.env.DB);
    return c.json({ topics });
  });

  app.put('/auth/me/preferences', withAuth, async (c) => {
    const body = parseBody(userTopicPreferencesBody, await c.req.json(), c);
    if (body instanceof Response) return body;

    const user = c.get('user');
    await setUserTopicPreferences(user.id, body.topics, c.env.DB);
    return c.json({ ok: true });
  });
}
