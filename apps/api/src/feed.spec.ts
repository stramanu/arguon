import { env, applyD1Migrations } from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import app from './index.js';

const NOW = '2025-07-21T12:00:00Z';
const HOUR_AGO = '2025-07-21T11:00:00Z';
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

async function seedPost(opts: {
  id: string;
  agentId?: string;
  headline?: string;
  summary?: string;
  confidence?: number;
  tags?: string[];
  region?: string;
  createdAt?: string;
}) {
  const {
    id,
    agentId = 'agent-1',
    headline = 'Test Headline',
    summary = 'Test summary content',
    confidence = 80,
    tags = ['technology'],
    region = 'global',
    createdAt = NOW,
  } = opts;
  await env.DB
    .prepare(
      `INSERT INTO posts (id, agent_id, headline, summary, confidence_score, tags_json, region, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, agentId, headline, summary, confidence, JSON.stringify(tags), region, createdAt, createdAt)
    .run();
}

async function seedComment(opts: {
  id: string;
  postId: string;
  userId: string;
  content?: string;
  parentId?: string | null;
  createdAt?: string;
}) {
  const { id, postId, userId, content = 'A comment', parentId = null, createdAt = NOW } = opts;
  await env.DB
    .prepare(
      `INSERT INTO comments (id, post_id, parent_comment_id, user_id, content, is_ai, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
    )
    .bind(id, postId, parentId, userId, content, createdAt)
    .run();
}

beforeEach(async () => {
  const migrations = env.D1_MIGRATIONS as D1Migration[];
  await applyD1Migrations(env.DB, migrations);
  await env.DB.exec('PRAGMA foreign_keys = OFF');
  for (const table of [
    'reactions', 'comments', 'post_sources', 'posts', 'follows',
    'agent_profiles', 'users', 'providers',
  ]) {
    await env.DB.exec(`DELETE FROM ${table}`);
  }
  await env.DB.exec('PRAGMA foreign_keys = ON');

  await seedProvider();
  await seedAgent();
});

describe('GET /feed', () => {
  it('returns empty feed', async () => {
    const res = await app.request('/feed', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ posts: unknown[]; next_cursor: string | null }>();
    expect(body.posts).toHaveLength(0);
    expect(body.next_cursor).toBeNull();
  });

  it('returns posts with agent info', async () => {
    await seedPost({ id: 'p1', confidence: 85 });

    const res = await app.request('/feed', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ posts: Array<{
      id: string;
      headline: string;
      confidence_score: number;
      confidence_label: string;
      confidence_color: string;
      agent: { handle: string; model_id: string; is_verified_ai: boolean };
      reaction_counts: Record<string, number>;
      user_reaction: string | null;
    }> }>();

    expect(body.posts).toHaveLength(1);
    const post = body.posts[0];
    expect(post.id).toBe('p1');
    expect(post.headline).toBe('Test Headline');
    expect(post.confidence_score).toBe(85);
    expect(post.confidence_label).toBe('Likely accurate');
    expect(post.confidence_color).toBe('yellow');
    expect(post.agent.handle).toBe('marcus');
    expect(post.agent.model_id).toBe('claude-haiku-4-5');
    expect(post.agent.is_verified_ai).toBe(true);
    expect(post.reaction_counts).toBeDefined();
    expect(post.user_reaction).toBeNull();
  });

  it('returns posts sorted by recency', async () => {
    await seedPost({ id: 'p-old', createdAt: TWO_HOURS_AGO });
    await seedPost({ id: 'p-new', createdAt: NOW });

    const res = await app.request('/feed', {}, env);
    const body = await res.json<{ posts: Array<{ id: string }> }>();
    expect(body.posts[0].id).toBe('p-new');
    expect(body.posts[1].id).toBe('p-old');
  });

  it('supports cursor pagination', async () => {
    await seedPost({ id: 'p1', createdAt: '2025-07-21T10:00:00Z' });
    await seedPost({ id: 'p2', createdAt: '2025-07-21T11:00:00Z' });
    await seedPost({ id: 'p3', createdAt: '2025-07-21T12:00:00Z' });

    const page1 = await app.request('/feed?limit=2', {}, env);
    const body1 = await page1.json<{ posts: Array<{ id: string }>; next_cursor: string | null }>();
    expect(body1.posts).toHaveLength(2);
    expect(body1.next_cursor).not.toBeNull();

    const page2 = await app.request(`/feed?limit=2&cursor=${body1.next_cursor}`, {}, env);
    const body2 = await page2.json<{ posts: Array<{ id: string }>; next_cursor: string | null }>();
    expect(body2.posts).toHaveLength(1);
    expect(body2.next_cursor).toBeNull();
  });

  it('filters by tag', async () => {
    await seedPost({ id: 'p-tech', tags: ['technology'] });
    await seedPost({ id: 'p-pol', tags: ['politics'] });

    const res = await app.request('/feed?tag=technology', {}, env);
    const body = await res.json<{ posts: Array<{ id: string }> }>();
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0].id).toBe('p-tech');
  });

  it('filters by region', async () => {
    await seedPost({ id: 'p-eu', region: 'EU' });
    await seedPost({ id: 'p-us', region: 'US' });

    const res = await app.request('/feed?region=EU', {}, env);
    const body = await res.json<{ posts: Array<{ id: string }> }>();
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0].id).toBe('p-eu');
  });

  it('returns 401 for following feed without auth', async () => {
    const res = await app.request('/feed?following=true', {}, env);
    expect(res.status).toBe(401);
  });

  it('includes comment_count', async () => {
    await seedPost({ id: 'p1' });
    await seedComment({ id: 'c1', postId: 'p1', userId: 'agent-1' });
    await seedComment({ id: 'c2', postId: 'p1', userId: 'agent-1' });

    const res = await app.request('/feed', {}, env);
    const body = await res.json<{ posts: Array<{ comment_count: number }> }>();
    expect(body.posts[0].comment_count).toBe(2);
  });

  it('sorts by confidence when requested', async () => {
    await seedPost({ id: 'p-low', confidence: 30, createdAt: NOW });
    await seedPost({ id: 'p-high', confidence: 95, createdAt: TWO_HOURS_AGO });

    const res = await app.request('/feed?sort=confidence', {}, env);
    const body = await res.json<{ posts: Array<{ id: string }> }>();
    expect(body.posts[0].id).toBe('p-high');
    expect(body.posts[1].id).toBe('p-low');
  });
});

describe('GET /feed/scores', () => {
  it('returns 400 without since parameter', async () => {
    const res = await app.request('/feed/scores', {}, env);
    expect(res.status).toBe(400);
  });

  it('returns updated scores', async () => {
    await seedPost({ id: 'p1', confidence: 85, createdAt: NOW });

    const res = await app.request(`/feed/scores?since=${HOUR_AGO}`, {}, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ scores: Array<{
      post_id: string;
      confidence_score: number;
      confidence_label: string;
      confidence_color: string;
    }> }>();

    expect(body.scores).toHaveLength(1);
    expect(body.scores[0].post_id).toBe('p1');
    expect(body.scores[0].confidence_score).toBe(85);
    expect(body.scores[0].confidence_label).toBe('Likely accurate');
  });

  it('returns empty when no updates since timestamp', async () => {
    await seedPost({ id: 'p1', createdAt: TWO_HOURS_AGO });

    const res = await app.request(`/feed/scores?since=${NOW}`, {}, env);
    const body = await res.json<{ scores: unknown[] }>();
    expect(body.scores).toHaveLength(0);
  });
});

describe('GET /posts/:id', () => {
  it('returns 404 for nonexistent post', async () => {
    const res = await app.request('/posts/nonexistent', {}, env);
    expect(res.status).toBe(404);
  });

  it('returns post detail with agent info', async () => {
    await seedPost({ id: 'p1', confidence: 92 });

    const res = await app.request('/posts/p1', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ data: {
      id: string;
      confidence_label: string;
      confidence_color: string;
      agent: { handle: string };
      sources: unknown[];
      reaction_counts: Record<string, number>;
      user_reaction: string | null;
      comment_count: number;
    } }>();

    expect(body.data.id).toBe('p1');
    expect(body.data.confidence_label).toBe('Highly verified');
    expect(body.data.confidence_color).toBe('green');
    expect(body.data.agent?.handle).toBe('marcus');
    expect(body.data.sources).toEqual([]);
    expect(body.data.user_reaction).toBeNull();
    expect(body.data.comment_count).toBe(0);
  });

  it('includes post sources', async () => {
    await seedPost({ id: 'p1' });
    await env.DB.exec(
      `INSERT INTO post_sources (post_id, url, title) VALUES ('p1', 'https://example.com', 'Example')`,
    );

    const res = await app.request('/posts/p1', {}, env);
    const body = await res.json<{ data: { sources: Array<{ url: string; title: string }> } }>();
    expect(body.data.sources).toHaveLength(1);
    expect(body.data.sources[0].url).toBe('https://example.com');
  });
});

describe('GET /posts/:id/comments', () => {
  it('returns empty comments for post', async () => {
    await seedPost({ id: 'p1' });
    const res = await app.request('/posts/p1/comments', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ comments: unknown[]; next_cursor: string | null }>();
    expect(body.comments).toHaveLength(0);
    expect(body.next_cursor).toBeNull();
  });

  it('returns threaded comments', async () => {
    await seedPost({ id: 'p1' });

    // Create a human user for comments
    await env.DB
      .prepare('INSERT INTO users (id, handle, name, is_ai, created_at) VALUES (?, ?, ?, 0, ?)')
      .bind('human-1', 'alice', 'Alice', TWO_HOURS_AGO)
      .run();

    await seedComment({ id: 'c-parent', postId: 'p1', userId: 'agent-1', content: 'Root comment', createdAt: HOUR_AGO });
    await seedComment({ id: 'c-reply', postId: 'p1', userId: 'human-1', content: 'Reply', parentId: 'c-parent', createdAt: NOW });

    const res = await app.request('/posts/p1/comments', {}, env);
    const body = await res.json<{ comments: Array<{
      id: string;
      content: string;
      user: { handle: string };
      replies: Array<{ id: string; content: string; user: { handle: string } }>;
    }> }>();

    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].id).toBe('c-parent');
    expect(body.comments[0].content).toBe('Root comment');
    expect(body.comments[0].user.handle).toBe('marcus');
    expect(body.comments[0].replies).toHaveLength(1);
    expect(body.comments[0].replies[0].id).toBe('c-reply');
    expect(body.comments[0].replies[0].user.handle).toBe('alice');
  });
});

describe('GET /users/:handle/posts', () => {
  it('returns 404 for unknown handle', async () => {
    const res = await app.request('/users/unknown/posts', {}, env);
    expect(res.status).toBe(404);
  });

  it('returns posts by handle', async () => {
    await seedPost({ id: 'p1' });
    await seedPost({ id: 'p2' });

    const res = await app.request('/users/marcus/posts', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ posts: Array<{ id: string }>; next_cursor: string | null }>();
    expect(body.posts).toHaveLength(2);
  });

  it('does not return posts from other agents', async () => {
    await seedAgent('agent-2', 'sophia');
    await seedPost({ id: 'p1', agentId: 'agent-1' });
    await seedPost({ id: 'p2', agentId: 'agent-2' });

    const res = await app.request('/users/marcus/posts', {}, env);
    const body = await res.json<{ posts: Array<{ id: string }> }>();
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0].id).toBe('p1');
  });

  it('supports cursor pagination', async () => {
    await seedPost({ id: 'p1', createdAt: '2025-07-21T10:00:00Z' });
    await seedPost({ id: 'p2', createdAt: '2025-07-21T11:00:00Z' });
    await seedPost({ id: 'p3', createdAt: '2025-07-21T12:00:00Z' });

    const page1 = await app.request('/users/marcus/posts?limit=2', {}, env);
    const body1 = await page1.json<{ posts: Array<{ id: string }>; next_cursor: string | null }>();
    expect(body1.posts).toHaveLength(2);
    expect(body1.next_cursor).not.toBeNull();

    const page2 = await app.request(`/users/marcus/posts?limit=2&cursor=${body1.next_cursor}`, {}, env);
    const body2 = await page2.json<{ posts: Array<{ id: string }>; next_cursor: string | null }>();
    expect(body2.posts).toHaveLength(1);
    expect(body2.next_cursor).toBeNull();
  });
});
