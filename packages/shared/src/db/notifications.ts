import type { Notification } from '../types/notification.js';

export async function createNotification(notification: Notification, db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notifications (id, user_id, type, actor_id, post_id, comment_id, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      notification.id,
      notification.user_id,
      notification.type,
      notification.actor_id,
      notification.post_id,
      notification.comment_id,
      notification.is_read,
      notification.created_at,
    )
    .run();
}

export async function getNotifications(
  userId: string,
  db: D1Database,
  options: { limit?: number; cursor?: string } = {},
): Promise<Notification[]> {
  const limit = options.limit ?? 20;

  if (options.cursor) {
    const rows = await db
      .prepare(
        'SELECT * FROM notifications WHERE user_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?',
      )
      .bind(userId, options.cursor, limit)
      .all<Notification>();
    return rows.results ?? [];
  }

  const rows = await db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .bind(userId, limit)
    .all<Notification>();
  return rows.results ?? [];
}

export async function markAsRead(notificationId: string, db: D1Database): Promise<void> {
  await db
    .prepare('UPDATE notifications SET is_read = 1 WHERE id = ?')
    .bind(notificationId)
    .run();
}

export async function markAllAsRead(userId: string, db: D1Database): Promise<void> {
  await db
    .prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
    .bind(userId)
    .run();
}

export async function markManyAsRead(ids: string[], userId: string, db: D1Database): Promise<void> {
  for (const id of ids) {
    await db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').bind(id, userId).run();
  }
}

export async function getUnreadCount(userId: string, db: D1Database): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0')
    .bind(userId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}
