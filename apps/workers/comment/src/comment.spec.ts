import { env, applyD1Migrations } from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { shouldAgentComment } from './index.js';

const NOW = '2025-07-21T12:00:00Z';
const HOUR_AGO = '2025-07-21T11:00:00Z';
const TWO_HOURS_AGO = '2025-07-21T10:00:00Z';

async function seedProvider() {
  await env.DB.exec(
    `INSERT INTO providers (id, name, api_base) VALUES ('anthropic', 'Anthropic', 'https://api.anthropic.com')`,
  );
}

async function seedAgent(id: string, handle: string) {
  await env.DB
    .prepare('INSERT INTO users (id, handle, name, is_ai, is_verified_ai, created_at) VALUES (?, ?, ?, 1, 1, ?)')
    .bind(id, handle, handle, TWO_HOURS_AGO)
    .run();
  await env.DB
    .prepare('INSERT INTO agent_profiles (user_id, provider_id, model_id, language, personality_json, behavior_json) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, 'anthropic', 'claude-haiku', 'en', '{}', '{}')
    .run();
}

async function seedPost(id: string, agentId: string) {
  await env.DB
    .prepare(
      `INSERT INTO posts (id, agent_id, headline, summary, confidence_score, tags_json, region, created_at, updated_at)
       VALUES (?, ?, 'Test', 'Summary', 80, '[]', 'global', ?, ?)`,
    )
    .bind(id, agentId, NOW, NOW)
    .run();
}

async function seedComment(opts: {
  id: string;
  postId: string;
  userId: string;
  isAi: number;
  createdAt?: string;
}) {
  const { id, postId, userId, isAi, createdAt = NOW } = opts;
  await env.DB
    .prepare(
      `INSERT INTO comments (id, post_id, parent_comment_id, user_id, content, is_ai, created_at)
       VALUES (?, ?, NULL, ?, 'Comment', ?, ?)`,
    )
    .bind(id, postId, userId, isAi, createdAt)
    .run();
}

beforeEach(async () => {
  const migrations = env.D1_MIGRATIONS as D1Migration[];
  await applyD1Migrations(env.DB, migrations);
  await env.DB.exec('PRAGMA foreign_keys = OFF');
  for (const table of ['comments', 'post_sources', 'posts', 'agent_profiles', 'users', 'providers']) {
    await env.DB.exec(`DELETE FROM ${table}`);
  }
  await env.DB.exec('PRAGMA foreign_keys = ON');

  await seedProvider();
  await seedAgent('a1', 'alice');
  await seedAgent('a2', 'bob');
  await seedAgent('a3', 'carol');
  await seedAgent('a4', 'dave');
  await seedAgent('a5', 'eve');
  await seedPost('p1', 'a1');
});

describe('shouldAgentComment', () => {
  it('allows commenting on a post with no comments', async () => {
    const result = await shouldAgentComment('a2', 'p1', 1.0, env.DB);
    expect(result).toBe(true);
  });

  it('blocks agent from commenting twice in a row', async () => {
    await seedComment({ id: 'c1', postId: 'p1', userId: 'a2', isAi: 1 });

    const result = await shouldAgentComment('a2', 'p1', 1.0, env.DB);
    expect(result).toBe(false);
  });

  it('allows commenting if a different agent commented last', async () => {
    await seedComment({ id: 'c1', postId: 'p1', userId: 'a2', isAi: 1 });
    await seedComment({ id: 'c2', postId: 'p1', userId: 'a3', isAi: 1 });

    const result = await shouldAgentComment('a2', 'p1', 1.0, env.DB);
    expect(result).toBe(true);
  });

  it('blocks after 4 consecutive AI comments (no cooldown passed)', async () => {
    await seedComment({ id: 'c1', postId: 'p1', userId: 'a2', isAi: 1, createdAt: NOW });
    await seedComment({ id: 'c2', postId: 'p1', userId: 'a3', isAi: 1, createdAt: NOW });
    await seedComment({ id: 'c3', postId: 'p1', userId: 'a4', isAi: 1, createdAt: NOW });
    await seedComment({ id: 'c4', postId: 'p1', userId: 'a5', isAi: 1, createdAt: NOW });

    // Pass nowMs just 5 minutes after the comments — well within the 30-min cooldown
    const nowMs = Date.parse(NOW) + 5 * 60_000;
    const result = await shouldAgentComment('a2', 'p1', 1.0, env.DB, nowMs);
    expect(result).toBe(false);
  });

  it('allows AI comments after cooldown passes (4 consecutive + 30 min)', async () => {
    const oldTime = '2025-07-21T11:00:00Z'; // 1 hour ago, > 30 min cooldown
    await seedComment({ id: 'c1', postId: 'p1', userId: 'a2', isAi: 1, createdAt: oldTime });
    await seedComment({ id: 'c2', postId: 'p1', userId: 'a3', isAi: 1, createdAt: oldTime });
    await seedComment({ id: 'c3', postId: 'p1', userId: 'a4', isAi: 1, createdAt: oldTime });
    await seedComment({ id: 'c4', postId: 'p1', userId: 'a5', isAi: 1, createdAt: oldTime });

    const result = await shouldAgentComment('a2', 'p1', 1.0, env.DB);
    expect(result).toBe(true);
  });

  it('resets consecutive count when human comments', async () => {
    const humanId = 'human-1';
    await env.DB
      .prepare('INSERT INTO users (id, handle, name, is_ai, is_verified_ai, created_at) VALUES (?, ?, ?, 0, 0, ?)')
      .bind(humanId, 'human', 'Human', TWO_HOURS_AGO)
      .run();

    await seedComment({ id: 'c1', postId: 'p1', userId: 'a2', isAi: 1 });
    await seedComment({ id: 'c2', postId: 'p1', userId: 'a3', isAi: 1 });
    await seedComment({ id: 'c3', postId: 'p1', userId: 'a4', isAi: 1 });
    await seedComment({ id: 'c4', postId: 'p1', userId: humanId, isAi: 0 }); // human breaks the chain

    // Should be allowed since consecutive AI count is 0 (reset by human)
    const result = await shouldAgentComment('a2', 'p1', 1.0, env.DB);
    expect(result).toBe(true);
  });

  it('respects comment_probability (0 always blocks)', async () => {
    const result = await shouldAgentComment('a2', 'p1', 0.0, env.DB);
    expect(result).toBe(false);
  });
});
