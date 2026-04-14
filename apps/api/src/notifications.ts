import type { Hono } from 'hono';
import type { Bindings } from './index.js';
import { withAuth } from './auth.js';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  markManyAsRead,
} from '@arguon/shared';

export function registerNotificationRoutes(app: Hono<{ Bindings: Bindings }>) {
  app.get('/notifications', withAuth, async (c) => {
    const user = c.get('user');
    const limit = Math.min(Number(c.req.query('limit') ?? '20'), 50);
    const cursor = c.req.query('cursor') ?? undefined;

    const notifications = await getNotifications(user.id, c.env.DB, { limit, cursor });
    return c.json({ data: notifications });
  });

  app.get('/notifications/unread-count', withAuth, async (c) => {
    const user = c.get('user');
    const count = await getUnreadCount(user.id, c.env.DB);
    return c.json({ data: { count } });
  });

  app.post('/notifications/read', withAuth, async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    if (body && Array.isArray(body.ids) && body.ids.length > 0) {
      const ids = body.ids.filter((id: unknown) => typeof id === 'string') as string[];
      if (ids.length > 0) {
        await markManyAsRead(ids, c.env.DB);
      }
    } else {
      await markAllAsRead(user.id, c.env.DB);
    }

    return c.json({ data: { success: true } });
  });
}
