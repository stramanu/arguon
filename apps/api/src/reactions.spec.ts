import { env, applyD1Migrations } from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import app from './index.js';
import {
  upsertReaction,
  deleteReaction,
  getReactionCounts,
} from '@arguon/shared/db/reactions.js';
import { insertComment } from '@arguon/shared';
import type { ReactionType } from '@arguon/shared';

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

async function seedPost(id = 'post-1', agentId = 'agent-1') {
  await env.DB
    .prepare(
      `INSERT INTO posts (id, agent_id, headline, summary, confidence_score, tags_json, region, created_at, updated_at)
       VALUES (?, ?, 'Test Headline', 'Test summary', 80, '["technology"]', 'global', ?, ?)`,
    )
    .bind(id, agentId, NOW, NOW)
    .run();
}

async function seedDBComment(id: string, postId: string, userId: string, isAi = 0, content = 'A comment') {
  await insertComment(
    { id, post_id: postId, parent_comment_id: null, user_id: userId, content, is_ai: isAi, created_at: NOW },
    env.DB,
  );
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
  await seedPost();
});

// --- Auth guard tests (API level) ---

describe('reaction endpoints require auth', () => {
  it('POST /posts/:id/reactions returns 401 without auth', async () => {
    const res = await app.request('/posts/post-1/reactions', {
      method: 'POST',
      body: JSON.stringify({ reaction_type: 'agree' }),
      headers: { 'Content-Type': 'application/json' },
    }, env);
    expect(res.status).toBe(401);
  });

  it('DELETE /posts/:id/reactions returns 401 without auth', async () => {
    const res = await app.request('/posts/post-1/reactions', {
      method: 'DELETE',
    }, env);
    expect(res.status).toBe(401);
  });

  it('POST /comments/:id/reactions returns 401 without auth', async () => {
    await seedDBComment('c1', 'post-1', 'agent-1', 1);
    const res = await app.request('/comments/c1/reactions', {
      method: 'POST',
      body: JSON.stringify({ reaction_type: 'agree' }),
      headers: { 'Content-Type': 'application/json' },
    }, env);
    expect(res.status).toBe(401);
  });

  it('POST /posts/:id/comments returns 401 without auth', async () => {
    const res = await app.request('/posts/post-1/comments', {
      method: 'POST',
      body: JSON.stringify({ content: 'Hello' }),
      headers: { 'Content-Type': 'application/json' },
    }, env);
    expect(res.status).toBe(401);
  });
});

// --- Reaction DB logic ---

describe('reaction DB operations', () => {
  it('upsertReaction adds a reaction and getReactionCounts returns it', async () => {
    await upsertReaction(
      { id: 'r1', user_id: 'user-1', target_type: 'post', target_id: 'post-1', reaction_type: 'agree' as ReactionType, created_at: NOW },
      env.DB,
    );
    const counts = await getReactionCounts('post', 'post-1', env.DB);
    expect(counts.agree).toBe(1);
    expect(counts.interesting).toBe(0);
  });

  it('upsertReaction replaces an existing reaction (upsert)', async () => {
    await upsertReaction(
      { id: 'r1', user_id: 'user-1', target_type: 'post', target_id: 'post-1', reaction_type: 'agree' as ReactionType, created_at: NOW },
      env.DB,
    );
    await upsertReaction(
      { id: 'r1-v2', user_id: 'user-1', target_type: 'post', target_id: 'post-1', reaction_type: 'interesting' as ReactionType, created_at: NOW },
      env.DB,
    );
    const counts = await getReactionCounts('post', 'post-1', env.DB);
    expect(counts.agree).toBe(0);
    expect(counts.interesting).toBe(1);
  });

  it('deleteReaction removes a reaction', async () => {
    await upsertReaction(
      { id: 'r1', user_id: 'user-1', target_type: 'post', target_id: 'post-1', reaction_type: 'agree' as ReactionType, created_at: NOW },
      env.DB,
    );
    await deleteReaction('user-1', 'post', 'post-1', env.DB);
    const counts = await getReactionCounts('post', 'post-1', env.DB);
    expect(counts.agree).toBe(0);
  });

  it('reactions work for comments too', async () => {
    await seedDBComment('c1', 'post-1', 'agent-1', 1);
    await upsertReaction(
      { id: 'r1', user_id: 'user-1', target_type: 'comment', target_id: 'c1', reaction_type: 'insightful' as ReactionType, created_at: NOW },
      env.DB,
    );
    const counts = await getReactionCounts('comment', 'c1', env.DB);
    expect(counts.insightful).toBe(1);
  });

  it('multiple users can react to the same post', async () => {
    await seedUser('user-2', 'bob');
    await upsertReaction(
      { id: 'r1', user_id: 'user-1', target_type: 'post', target_id: 'post-1', reaction_type: 'agree' as ReactionType, created_at: NOW },
      env.DB,
    );
    await upsertReaction(
      { id: 'r2', user_id: 'user-2', target_type: 'post', target_id: 'post-1', reaction_type: 'agree' as ReactionType, created_at: NOW },
      env.DB,
    );
    const counts = await getReactionCounts('post', 'post-1', env.DB);
    expect(counts.agree).toBe(2);
  });
});

// --- Comment DB logic ---

describe('comment DB operations', () => {
  it('insertComment stores a comment', async () => {
    await insertComment(
      { id: 'c1', post_id: 'post-1', parent_comment_id: null, user_id: 'user-1', content: 'Great post!', is_ai: 0, created_at: NOW },
      env.DB,
    );
    const row = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind('c1').first();
    expect(row).not.toBeNull();
    expect(row!.content).toBe('Great post!');
    expect(row!.is_ai).toBe(0);
  });

  it('insertComment supports nested replies', async () => {
    await insertComment(
      { id: 'c1', post_id: 'post-1', parent_comment_id: null, user_id: 'user-1', content: 'Root', is_ai: 0, created_at: NOW },
      env.DB,
    );
    await insertComment(
      { id: 'c2', post_id: 'post-1', parent_comment_id: 'c1', user_id: 'agent-1', content: 'Reply', is_ai: 1, created_at: NOW },
      env.DB,
    );
    const reply = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind('c2').first();
    expect(reply!.parent_comment_id).toBe('c1');
    expect(reply!.is_ai).toBe(1);
  });
});
