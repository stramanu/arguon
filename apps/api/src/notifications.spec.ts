import { env, applyD1Migrations } from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import app from './index.js';
import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  markManyAsRead,
} from '@arguon/shared/db/notifications.js';
import { insertComment, getCommentById } from '@arguon/shared/db/comments.js';
import { insertFollow, getFollowerIds } from '@arguon/shared/db/follows.js';
import type { Notification } from '@arguon/shared';

const NOW = '2025-07-21T12:00:00Z';

async function seedUser(id: string, handle: string, isAi = false) {
  await env.DB
    .prepare(
      'INSERT INTO users (id, clerk_user_id, handle, name, is_ai, is_verified_ai, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
    )
    .bind(id, `clerk_${id}`, handle, handle.charAt(0).toUpperCase() + handle.slice(1), isAi ? 1 : 0, NOW)
    .run();
}

async function seedPost(id: string, agentId: string) {
  await env.DB
    .prepare("INSERT INTO posts (id, agent_id, headline, summary, created_at) VALUES (?, ?, 'Test Post', 'Summary', ?)")
    .bind(id, agentId, NOW)
    .run();
}

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: crypto.randomUUID(),
    user_id: 'user-1',
    type: 'reply',
    actor_id: 'user-2',
    post_id: 'post-1',
    comment_id: null,
    is_read: 0,
    created_at: NOW,
    ...overrides,
  };
}

beforeEach(async () => {
  const migrations = env.D1_MIGRATIONS as D1Migration[];
  await applyD1Migrations(env.DB, migrations);
  await env.DB.exec('PRAGMA foreign_keys = OFF');
  for (const table of [
    'notifications', 'moderation_log', 'reactions', 'comments', 'post_sources',
    'posts', 'follows', 'agent_profiles', 'users', 'providers', 'daily_budget',
  ]) {
    await env.DB.exec(`DELETE FROM ${table}`);
  }
  await env.DB.exec('PRAGMA foreign_keys = ON');

  await seedUser('user-1', 'alice');
  await seedUser('user-2', 'bob');
  await seedUser('agent-1', 'marcus', true);
  await seedPost('post-1', 'agent-1');
});

// --- Auth guard tests ---

describe('notification endpoints require auth', () => {
  it('GET /notifications returns 401 without auth', async () => {
    const res = await app.request('/notifications', {}, env);
    expect(res.status).toBe(401);
  });

  it('GET /notifications/unread-count returns 401 without auth', async () => {
    const res = await app.request('/notifications/unread-count', {}, env);
    expect(res.status).toBe(401);
  });

  it('POST /notifications/read returns 401 without auth', async () => {
    const res = await app.request('/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, env);
    expect(res.status).toBe(401);
  });
});

// --- DB-level notification tests ---

describe('notification creation on comment reply', () => {
  it('creates a reply notification when parent_comment_id is set', async () => {
    // User-2 comments on post
    const parentComment = {
      id: 'comment-parent',
      post_id: 'post-1',
      parent_comment_id: null,
      user_id: 'user-2',
      content: 'Great post!',
      is_ai: 0,
      created_at: '2025-07-21T11:00:00Z',
    };
    await insertComment(parentComment, env.DB);

    // Verify getCommentById works
    const fetched = await getCommentById('comment-parent', env.DB);
    expect(fetched).not.toBeNull();
    expect(fetched!.user_id).toBe('user-2');

    // User-1 replies
    await insertComment({
      id: 'comment-reply',
      post_id: 'post-1',
      parent_comment_id: 'comment-parent',
      user_id: 'user-1',
      content: 'Thanks!',
      is_ai: 0,
      created_at: NOW,
    }, env.DB);

    // Simulate notification creation
    const notif: Notification = {
      id: crypto.randomUUID(),
      user_id: fetched!.user_id,
      type: 'reply',
      actor_id: 'user-1',
      post_id: 'post-1',
      comment_id: 'comment-reply',
      is_read: 0,
      created_at: NOW,
    };
    await createNotification(notif, env.DB);

    const notifications = await getNotifications('user-2', env.DB);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('reply');
    expect(notifications[0].actor_id).toBe('user-1');
  });
});

describe('notification creation on @mention', () => {
  it('creates mention notifications for @handles in content', async () => {
    // Simulate parsing @bob and creating notification
    const content = 'Hey @bob, check this out!';
    const mentionPattern = /@([a-zA-Z0-9_]+)/g;
    const matches = [...content.matchAll(mentionPattern)];
    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe('bob');

    // Insert the comment that the notification references
    await insertComment({
      id: 'comment-1',
      post_id: 'post-1',
      parent_comment_id: null,
      user_id: 'user-1',
      content,
      is_ai: 0,
      created_at: NOW,
    }, env.DB);

    const notif: Notification = {
      id: crypto.randomUUID(),
      user_id: 'user-2', // bob
      type: 'mention',
      actor_id: 'user-1',
      post_id: 'post-1',
      comment_id: 'comment-1',
      is_read: 0,
      created_at: NOW,
    };
    await createNotification(notif, env.DB);

    const notifications = await getNotifications('user-2', env.DB);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('mention');
  });
});

describe('notification creation on new post by followed agent', () => {
  it('creates new_post notifications for all followers', async () => {
    // Both users follow agent-1
    await insertFollow('user-1', 'agent-1', env.DB);
    await insertFollow('user-2', 'agent-1', env.DB);

    const followerIds = await getFollowerIds('agent-1', env.DB);
    expect(followerIds).toHaveLength(2);

    // Simulate generation worker creating notifications
    for (const followerId of followerIds) {
      const notif: Notification = {
        id: crypto.randomUUID(),
        user_id: followerId,
        type: 'new_post',
        actor_id: 'agent-1',
        post_id: 'post-1',
        comment_id: null,
        is_read: 0,
        created_at: NOW,
      };
      await createNotification(notif, env.DB);
    }

    const user1Notifs = await getNotifications('user-1', env.DB);
    const user2Notifs = await getNotifications('user-2', env.DB);
    expect(user1Notifs).toHaveLength(1);
    expect(user1Notifs[0].type).toBe('new_post');
    expect(user2Notifs).toHaveLength(1);
    expect(user2Notifs[0].type).toBe('new_post');
  });
});

describe('unread count', () => {
  it('returns correct unread count', async () => {
    await createNotification(makeNotification({ id: 'n1' }), env.DB);
    await createNotification(makeNotification({ id: 'n2' }), env.DB);

    const count = await getUnreadCount('user-1', env.DB);
    expect(count).toBe(2);
  });

  it('decreases after marking as read', async () => {
    await createNotification(makeNotification({ id: 'n1' }), env.DB);
    await createNotification(makeNotification({ id: 'n2' }), env.DB);

    await markAsRead('n1', env.DB);
    const count = await getUnreadCount('user-1', env.DB);
    expect(count).toBe(1);
  });
});

describe('mark all as read', () => {
  it('marks all notifications as read for a user', async () => {
    await createNotification(makeNotification({ id: 'n1' }), env.DB);
    await createNotification(makeNotification({ id: 'n2' }), env.DB);
    await createNotification(makeNotification({ id: 'n3', user_id: 'user-2' }), env.DB);

    await markAllAsRead('user-1', env.DB);

    const user1Count = await getUnreadCount('user-1', env.DB);
    const user2Count = await getUnreadCount('user-2', env.DB);
    expect(user1Count).toBe(0);
    expect(user2Count).toBe(1); // Unchanged
  });
});

describe('mark many as read', () => {
  it('marks specific notification IDs as read', async () => {
    await createNotification(makeNotification({ id: 'n1' }), env.DB);
    await createNotification(makeNotification({ id: 'n2' }), env.DB);
    await createNotification(makeNotification({ id: 'n3' }), env.DB);

    await markManyAsRead(['n1', 'n3'], 'user-1', env.DB);

    const count = await getUnreadCount('user-1', env.DB);
    expect(count).toBe(1);

    const notifications = await getNotifications('user-1', env.DB);
    const n2 = notifications.find((n) => n.id === 'n2');
    expect(n2!.is_read).toBe(0);
  });
});
