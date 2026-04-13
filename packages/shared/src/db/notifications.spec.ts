import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { createNotification, getNotifications, markAsRead, getUnreadCount } from '../db/notifications.js';
import { applyMigrations } from '../db/test-helpers.js';
import type { Notification } from '../types/notification.js';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n1',
    user_id: 'u1',
    type: 'reply',
    actor_id: 'u2',
    post_id: 'p1',
    comment_id: null,
    is_read: 0,
    created_at: '2025-06-01T12:00:00Z',
    ...overrides,
  };
}

describe('notifications', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.exec(
      "INSERT INTO users (id, handle, name, is_ai, created_at) VALUES ('u1', 'alice', 'Alice', 0, '2025-01-01T00:00:00Z')",
    );
    await env.DB.exec(
      "INSERT INTO users (id, handle, name, is_ai, created_at) VALUES ('u2', 'bob', 'Bob', 0, '2025-01-01T00:00:00Z')",
    );
    await env.DB.exec(
      "INSERT INTO posts (id, agent_id, headline, summary, created_at) VALUES ('p1', 'u2', 'Post', 'Summary', '2025-06-01T00:00:00Z')",
    );
  });

  describe('createNotification', () => {
    it('inserts a notification', async () => {
      await createNotification(makeNotification(), env.DB);
      const notifications = await getNotifications('u1', env.DB);
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('reply');
    });
  });

  describe('getNotifications', () => {
    it('returns notifications in reverse chronological order', async () => {
      await createNotification(makeNotification({ id: 'n1', created_at: '2025-06-01T10:00:00Z' }), env.DB);
      await createNotification(makeNotification({ id: 'n2', created_at: '2025-06-01T12:00:00Z' }), env.DB);

      const notifications = await getNotifications('u1', env.DB);
      expect(notifications[0].id).toBe('n2');
      expect(notifications[1].id).toBe('n1');
    });

    it('supports cursor-based pagination', async () => {
      await createNotification(makeNotification({ id: 'n1', created_at: '2025-06-01T10:00:00Z' }), env.DB);
      await createNotification(makeNotification({ id: 'n2', created_at: '2025-06-01T12:00:00Z' }), env.DB);

      const page = await getNotifications('u1', env.DB, { cursor: '2025-06-01T12:00:00Z' });
      expect(page).toHaveLength(1);
      expect(page[0].id).toBe('n1');
    });
  });

  describe('markAsRead', () => {
    it('marks a notification as read', async () => {
      await createNotification(makeNotification(), env.DB);
      await markAsRead('n1', env.DB);

      const notifications = await getNotifications('u1', env.DB);
      expect(notifications[0].is_read).toBe(1);
    });
  });

  describe('getUnreadCount', () => {
    it('counts unread notifications', async () => {
      await createNotification(makeNotification({ id: 'n1' }), env.DB);
      await createNotification(makeNotification({ id: 'n2' }), env.DB);

      const count = await getUnreadCount('u1', env.DB);
      expect(count).toBe(2);
    });

    it('excludes read notifications', async () => {
      await createNotification(makeNotification({ id: 'n1', is_read: 0 }), env.DB);
      await createNotification(makeNotification({ id: 'n2', is_read: 1 }), env.DB);

      const count = await getUnreadCount('u1', env.DB);
      expect(count).toBe(1);
    });
  });
});
