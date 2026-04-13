import { env, applyD1Migrations } from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import app from './index.js';
import {
  insertFollow,
  deleteFollow,
  isFollowing,
  getFollowCounts,
  getFollowersPaginated,
  getFollowingPaginated,
} from '@arguon/shared/db/follows.js';

const NOW = '2025-07-21T12:00:00Z';
const TWO_HOURS_AGO = '2025-07-21T10:00:00Z';

async function seedProvider() {
  await env.DB.exec(
    `INSERT INTO providers (id, name, api_base) VALUES ('anthropic', 'Anthropic', 'https://api.anthropic.com')`,
  );
}

async function seedAgent(id = 'agent-1', handle = 'marcus') {
  const name = handle.charAt(0).toUpperCase() + handle.slice(1);
  await env.DB
    .prepare('INSERT INTO users (id, handle, name, is_ai, is_verified_ai, created_at) VALUES (?, ?, ?, 1, 1, ?)')
    .bind(id, handle, name, TWO_HOURS_AGO)
    .run();
  await env.DB
    .prepare('INSERT INTO agent_profiles (user_id, provider_id, model_id, language, personality_json, behavior_json) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, 'anthropic', 'claude-haiku-4-5', 'en', '{}', '{}')
    .run();
}

async function seedUser(id = 'user-1', handle = 'alice') {
  await env.DB
    .prepare(
      'INSERT INTO users (id, clerk_user_id, handle, name, is_ai, is_verified_ai, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)',
    )
    .bind(id, `clerk_${id}`, handle, handle.charAt(0).toUpperCase() + handle.slice(1), TWO_HOURS_AGO)
    .run();
}

beforeEach(async () => {
  const migrations = env.D1_MIGRATIONS as D1Migration[];
  await applyD1Migrations(env.DB, migrations);
  await env.DB.exec('PRAGMA foreign_keys = OFF');
  for (const table of [
    'moderation_log', 'reactions', 'comments', 'post_sources', 'posts', 'follows',
    'agent_profiles', 'users', 'providers', 'daily_budget',
  ]) {
    await env.DB.exec(`DELETE FROM ${table}`);
  }
  await env.DB.exec('PRAGMA foreign_keys = ON');

  await seedProvider();
  await seedAgent();
  await seedUser();
});

// --- Auth guard tests ---

describe('follow endpoints require auth', () => {
  it('POST /users/:handle/follow returns 401 without auth', async () => {
    const res = await app.request('/users/marcus/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, env);
    expect(res.status).toBe(401);
  });

  it('DELETE /users/:handle/follow returns 401 without auth', async () => {
    const res = await app.request('/users/marcus/follow', {
      method: 'DELETE',
    }, env);
    expect(res.status).toBe(401);
  });
});

describe('follow/unfollow list endpoints', () => {
  it('GET /users/:handle/followers returns 404 for unknown user', async () => {
    const res = await app.request('/users/nobody/followers', {}, env);
    expect(res.status).toBe(404);
  });

  it('GET /users/:handle/following returns 404 for unknown user', async () => {
    const res = await app.request('/users/nobody/following', {}, env);
    expect(res.status).toBe(404);
  });

  it('GET /users/:handle/followers returns empty list', async () => {
    const res = await app.request('/users/marcus/followers', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ users: unknown[]; follower_count: number }>();
    expect(body.users).toHaveLength(0);
    expect(body.follower_count).toBe(0);
  });
});

// --- Follow DB operations ---

describe('follow DB operations', () => {
  it('insertFollow creates a follow and isFollowing returns true', async () => {
    await insertFollow('user-1', 'agent-1', env.DB);
    expect(await isFollowing('user-1', 'agent-1', env.DB)).toBe(true);
  });

  it('insertFollow is idempotent (INSERT OR IGNORE)', async () => {
    await insertFollow('user-1', 'agent-1', env.DB);
    await insertFollow('user-1', 'agent-1', env.DB);
    expect(await isFollowing('user-1', 'agent-1', env.DB)).toBe(true);

    const counts = await getFollowCounts('agent-1', env.DB);
    expect(counts.follower_count).toBe(1);
  });

  it('deleteFollow removes the follow', async () => {
    await insertFollow('user-1', 'agent-1', env.DB);
    await deleteFollow('user-1', 'agent-1', env.DB);
    expect(await isFollowing('user-1', 'agent-1', env.DB)).toBe(false);
  });

  it('deleteFollow is idempotent', async () => {
    await deleteFollow('user-1', 'agent-1', env.DB);
    expect(await isFollowing('user-1', 'agent-1', env.DB)).toBe(false);
  });

  it('getFollowCounts returns correct counts', async () => {
    await seedUser('user-2', 'bob');
    await insertFollow('user-1', 'agent-1', env.DB);
    await insertFollow('user-2', 'agent-1', env.DB);

    const counts = await getFollowCounts('agent-1', env.DB);
    expect(counts.follower_count).toBe(2);
    expect(counts.following_count).toBe(0);
  });

  it('getFollowersPaginated returns followers with cursor', async () => {
    await seedUser('user-2', 'bob');
    await seedUser('user-3', 'charlie');

    // Use raw inserts with distinct timestamps to test pagination
    await env.DB.prepare('INSERT INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)')
      .bind('user-1', 'agent-1', '2025-07-21T12:00:03Z').run();
    await env.DB.prepare('INSERT INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)')
      .bind('user-2', 'agent-1', '2025-07-21T12:00:02Z').run();
    await env.DB.prepare('INSERT INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)')
      .bind('user-3', 'agent-1', '2025-07-21T12:00:01Z').run();

    const page1 = await getFollowersPaginated('agent-1', env.DB, 2);
    expect(page1.users).toHaveLength(2);
    expect(page1.next_cursor).not.toBeNull();

    const page2 = await getFollowersPaginated('agent-1', env.DB, 2, page1.next_cursor!);
    expect(page2.users).toHaveLength(1);
    expect(page2.next_cursor).toBeNull();
  });

  it('getFollowingPaginated returns following users', async () => {
    await seedAgent('agent-2', 'aria');
    await insertFollow('user-1', 'agent-1', env.DB);
    await insertFollow('user-1', 'agent-2', env.DB);

    const result = await getFollowingPaginated('user-1', env.DB, 20);
    expect(result.users).toHaveLength(2);
    expect(result.next_cursor).toBeNull();
  });
});

// --- GET /users/:handle with follow info ---

describe('GET /users/:handle includes follow info', () => {
  it('returns follower_count and following_count', async () => {
    await insertFollow('user-1', 'agent-1', env.DB);

    const res = await app.request('/users/marcus', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ data: { follower_count: number; following_count: number; is_following: boolean } }>();
    expect(body.data.follower_count).toBe(1);
    expect(body.data.following_count).toBe(0);
    expect(body.data.is_following).toBe(false); // no auth → always false
  });
});

// --- Following feed filter ---

describe('following feed filter (DB-level)', () => {
  it('feed with following=true returns 401 without auth', async () => {
    const res = await app.request('/feed?following=true', {}, env);
    expect(res.status).toBe(401);
  });
});
