import type { Hono } from 'hono';
import type { Bindings } from './index.js';
import { withAuth, validateClerkJWT, getOrCreateLocalUser } from './auth.js';
import {
  getUserByHandle,
  insertFollow,
  deleteFollow,
  getFollowCounts,
  getFollowersPaginated,
  getFollowingPaginated,
  isFollowing,
} from '@arguon/shared';
import type { MiddlewareHandler } from 'hono';

const withOptionalAuth: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const clerkUserId = await validateClerkJWT(c.req.raw, c.env);
  if (clerkUserId) {
    const user = await getOrCreateLocalUser(clerkUserId, c.env.DB);
    c.set('user', user);
    c.set('clerkUserId', clerkUserId);
  }
  await next();
};

export function registerFollowRoutes(app: Hono<{ Bindings: Bindings }>) {
  app.post('/users/:handle/follow', withAuth, async (c) => {
    const handle = c.req.param('handle');
    const user = c.get('user');

    const target = await getUserByHandle(handle, c.env.DB);
    if (!target) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
    }

    if (target.id === user.id) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Cannot follow yourself' } }, 400);
    }

    const already = await isFollowing(user.id, target.id, c.env.DB);
    if (already) {
      return c.json({ error: { code: 'CONFLICT', message: 'Already following this user' } }, 409);
    }

    await insertFollow(user.id, target.id, c.env.DB);
    const counts = await getFollowCounts(target.id, c.env.DB);

    return c.json({ data: { is_following: true, ...counts } });
  });

  app.delete('/users/:handle/follow', withAuth, async (c) => {
    const handle = c.req.param('handle');
    const user = c.get('user');

    const target = await getUserByHandle(handle, c.env.DB);
    if (!target) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
    }

    await deleteFollow(user.id, target.id, c.env.DB);
    const counts = await getFollowCounts(target.id, c.env.DB);

    return c.json({ data: { is_following: false, ...counts } });
  });

  app.get('/users/:handle/followers', withOptionalAuth, async (c) => {
    const handle = c.req.param('handle');
    const target = await getUserByHandle(handle, c.env.DB);
    if (!target) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
    }

    const limit = Math.min(Number(c.req.query('limit') ?? '20'), 50);
    const cursor = c.req.query('cursor') ?? undefined;
    const authUser = c.get('user') ?? null;

    const { users, next_cursor } = await getFollowersPaginated(target.id, c.env.DB, limit, cursor);

    const items = await Promise.all(
      users.map(async (u) => ({
        id: u.id,
        handle: u.handle,
        name: u.name,
        avatar_url: u.avatar_url,
        is_ai: Boolean(u.is_ai),
        is_following: authUser ? await isFollowing(authUser.id, u.id, c.env.DB) : false,
      })),
    );

    const counts = await getFollowCounts(target.id, c.env.DB);
    return c.json({ users: items, ...counts, next_cursor });
  });

  app.get('/users/:handle/following', withOptionalAuth, async (c) => {
    const handle = c.req.param('handle');
    const target = await getUserByHandle(handle, c.env.DB);
    if (!target) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
    }

    const limit = Math.min(Number(c.req.query('limit') ?? '20'), 50);
    const cursor = c.req.query('cursor') ?? undefined;
    const authUser = c.get('user') ?? null;

    const { users, next_cursor } = await getFollowingPaginated(target.id, c.env.DB, limit, cursor);

    const items = await Promise.all(
      users.map(async (u) => ({
        id: u.id,
        handle: u.handle,
        name: u.name,
        avatar_url: u.avatar_url,
        is_ai: Boolean(u.is_ai),
        is_following: authUser ? await isFollowing(authUser.id, u.id, c.env.DB) : false,
      })),
    );

    const counts = await getFollowCounts(target.id, c.env.DB);
    return c.json({ users: items, ...counts, next_cursor });
  });
}
