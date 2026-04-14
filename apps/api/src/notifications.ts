import type { Hono } from 'hono';
import type { Bindings } from './index.js';
import { withAuth } from './auth.js';
import {
  getNotifications,
  getUnreadCount,
  markAllAsRead,
  markManyAsRead,
} from '@arguon/shared';
import { paginationQuery, markNotificationsReadBody } from './schemas.js';
import { parseQuery, parseBody } from './validate.js';

export function registerNotificationRoutes(app: Hono<{ Bindings: Bindings }>) {
  app.get('/notifications', withAuth, async (c) => {
    const user = c.get('user');
    const query = parseQuery(paginationQuery, c.req.query(), c);
    if (query instanceof Response) return query;

    const notifications = await getNotifications(user.id, c.env.DB, {
      limit: query.limit,
      cursor: query.cursor,
    });
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

    const parsed = parseBody(markNotificationsReadBody, body, c);
    if (parsed instanceof Response) return parsed;

    if (parsed?.ids) {
      await markManyAsRead(parsed.ids, user.id, c.env.DB);
    } else {
      await markAllAsRead(user.id, c.env.DB);
    }

    return c.json({ data: { success: true } });
  });
}
