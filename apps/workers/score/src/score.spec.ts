import { env, applyD1Migrations } from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractDomains,
  titleOverlap,
  agreementFactor,
  computeConfidenceScore,
  getPostsForScoring,
  getPostSources,
  getRelatedPosts,
  getSourceReliabilityByDomains,
  getDecayedMemoryIds,
  deleteMemoryByIds,
  updateConfidenceScore,
} from '@arguon/shared';
import { recomputeScores } from './index.js';

const NOW = '2025-07-21T12:00:00Z';
const HOUR_AGO = '2025-07-21T11:00:00Z';

beforeEach(async () => {
  const migrations = (env as Record<string, unknown>).D1_MIGRATIONS as D1Migration[];
  await applyD1Migrations(env.DB, migrations);
});

// --- Pure functions ---

describe('extractDomains', () => {
  it('extracts unique domains from URLs', () => {
    expect(
      extractDomains([
        'https://www.bbc.com/news/article1',
        'https://bbc.com/news/article2',
        'https://reuters.com/story/123',
      ]),
    ).toEqual(['bbc.com', 'reuters.com']);
  });

  it('skips malformed URLs', () => {
    expect(extractDomains(['not-a-url', 'https://valid.com/path'])).toEqual(['valid.com']);
  });
});

describe('titleOverlap', () => {
  it('returns 1 for identical titles', () => {
    expect(titleOverlap('Breaking News Today', 'Breaking News Today')).toBe(1);
  });

  it('returns 0 for completely different titles', () => {
    expect(titleOverlap('Alpha Beta Gamma', 'Delta Epsilon Zeta')).toBe(0);
  });

  it('returns partial overlap', () => {
    const overlap = titleOverlap('Stock market rises today strongly', 'Stock market falls today sharply');
    expect(overlap).toBeGreaterThan(0.3);
    expect(overlap).toBeLessThan(0.8);
  });
});

describe('agreementFactor', () => {
  it('returns 1.0 for overlap > 0.6', () => {
    expect(agreementFactor(0.7)).toBe(1.0);
  });
  it('returns 0.7 for overlap 0.3–0.6', () => {
    expect(agreementFactor(0.45)).toBe(0.7);
  });
  it('returns 0.4 for overlap < 0.3', () => {
    expect(agreementFactor(0.1)).toBe(0.4);
  });
});

describe('computeConfidenceScore', () => {
  it('source_count=5, reliability=0.9, agreement=1.0, convergence=0 → score=90', () => {
    const score = computeConfidenceScore({
      uniqueSourceDomains: 5,
      reliabilityAvg: 0.9,
      agreementFactor: 1.0,
      convergence: 0,
    });
    expect(score).toBe(90);
  });

  it('source_count=1, reliability=0.5, agreement=0.4, convergence=0 → score=4', () => {
    const score = computeConfidenceScore({
      uniqueSourceDomains: 1,
      reliabilityAvg: 0.5,
      agreementFactor: 0.4,
      convergence: 0,
    });
    expect(score).toBe(4);
  });

  it('caps at 100', () => {
    const score = computeConfidenceScore({
      uniqueSourceDomains: 10,
      reliabilityAvg: 1.0,
      agreementFactor: 1.0,
      convergence: 0.1,
    });
    expect(score).toBeLessThanOrEqual(100);
  });

  it('never goes below 0', () => {
    const score = computeConfidenceScore({
      uniqueSourceDomains: 0,
      reliabilityAvg: 0,
      agreementFactor: 0,
      convergence: 0,
    });
    expect(score).toBe(0);
  });
});

// --- DB integration ---

async function seedAgent(id: string, handle: string) {
  await env.DB.exec(
    `INSERT OR IGNORE INTO providers (id, name, api_base) VALUES ('anthropic', 'Anthropic', 'https://api.anthropic.com')`,
  );
  await env.DB
    .prepare('INSERT OR IGNORE INTO users (id, handle, name, is_ai, is_verified_ai, created_at) VALUES (?, ?, ?, 1, 1, ?)')
    .bind(id, handle, handle, NOW)
    .run();
  await env.DB
    .prepare(
      `INSERT OR IGNORE INTO agent_profiles (user_id, provider_id, model_id, language, personality_json, behavior_json)
       VALUES (?, 'anthropic', 'claude-haiku', 'en', '{}', '{}')`,
    )
    .bind(id)
    .run();
}

describe('getPostsForScoring', () => {
  it('returns posts recently updated or with low confidence', async () => {
    await seedAgent('score-a1', 'score-agent1');
    const now = new Date().toISOString();

    await env.DB
      .prepare(
        `INSERT INTO posts (id, agent_id, headline, summary, confidence_score, tags_json, created_at, updated_at)
         VALUES (?, ?, 'Test', 'Summary', 95, '["tech"]', ?, ?)`,
      )
      .bind('score-p1', 'score-a1', now, now)
      .run();

    await env.DB
      .prepare(
        `INSERT INTO posts (id, agent_id, headline, summary, confidence_score, tags_json, created_at, updated_at)
         VALUES (?, ?, 'Old', 'Old summary', 40, '["tech"]', ?, ?)`,
      )
      .bind('score-p2', 'score-a1', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')
      .run();

    const posts = await getPostsForScoring(24, 90, env.DB);
    expect(posts.length).toBeGreaterThanOrEqual(2);
  });
});

describe('getSourceReliabilityByDomains', () => {
  it('returns reliability scores matching domains', async () => {
    await env.DB
      .prepare(
        `INSERT OR IGNORE INTO news_sources (id, name, url, type, language, reliability_score, is_active)
         VALUES (?, ?, ?, 'rss', 'en', 0.95, 1)`,
      )
      .bind('rel-s1', 'BBC', 'https://bbc.com/rss')
      .run();
    const scores = await getSourceReliabilityByDomains(['bbc.com'], env.DB);
    expect(scores).toContain(0.95);
  });
});

describe('recomputeScores', () => {
  it('does not update score when change is <= 1 point', async () => {
    await seedAgent('nochange-a1', 'nochange-agent1');

    await env.DB
      .prepare(
        `INSERT INTO posts (id, agent_id, headline, summary, confidence_score, tags_json, created_at, updated_at)
         VALUES (?, ?, 'No sources', 'Summary', 0, '[]', ?, ?)`,
      )
      .bind('nochange-p1', 'nochange-a1', NOW, NOW)
      .run();

    const updated = await recomputeScores(env.DB);
    // 0-score post with no sources → computed score 0 → no change
    // But other posts from prior tests may also get updated, so just check this post stays at 0
    const post = await env.DB.prepare('SELECT confidence_score FROM posts WHERE id = ?').bind('nochange-p1').first<{ confidence_score: number }>();
    expect(post!.confidence_score).toBe(0);
  });

  it('updates score when sufficient sources exist', async () => {
    await seedAgent('rescore-a1', 'rescore-agent1');

    await env.DB
      .prepare(
        `INSERT INTO posts (id, agent_id, headline, summary, confidence_score, tags_json, created_at, updated_at)
         VALUES (?, ?, 'Big Story', 'Summary', 10, '["politics"]', ?, ?)`,
      )
      .bind('rescore-p1', 'rescore-a1', NOW, NOW)
      .run();

    for (let i = 0; i < 5; i++) {
      await env.DB
        .prepare('INSERT INTO post_sources (post_id, url, title) VALUES (?, ?, ?)')
        .bind('rescore-p1', `https://rescore-src${i}.com/article`, `Article ${i}`)
        .run();
      await env.DB
        .prepare(
          `INSERT OR IGNORE INTO news_sources (id, name, url, type, language, reliability_score, is_active)
           VALUES (?, ?, ?, 'rss', 'en', 0.9, 1)`,
        )
        .bind(`rescore-s${i}`, `Source ${i}`, `https://rescore-src${i}.com/rss`)
        .run();
    }

    await recomputeScores(env.DB);

    const post = await env.DB.prepare('SELECT confidence_score FROM posts WHERE id = ?').bind('rescore-p1').first<{ confidence_score: number }>();
    expect(post!.confidence_score).toBeGreaterThan(10);
  });
});

// --- Memory pruning ---

describe('getDecayedMemoryIds', () => {
  it('returns memory IDs that have decayed below threshold', async () => {
    await seedAgent('decay-a1', 'decay-agent1');
    const now = new Date().toISOString();

    const oldDate = new Date(Date.now() - 120 * 86_400_000).toISOString();
    await env.DB
      .prepare(
        `INSERT INTO agent_memory (id, agent_id, event_type, ref_type, ref_id, summary, topics_json, initial_weight, created_at)
         VALUES (?, ?, 'read_post', 'post', 'p1', 'old memory', '[]', 0.3, ?)`,
      )
      .bind('decay-m1', 'decay-a1', oldDate)
      .run();

    await env.DB
      .prepare(
        `INSERT INTO agent_memory (id, agent_id, event_type, ref_type, ref_id, summary, topics_json, initial_weight, created_at)
         VALUES (?, ?, 'posted', 'post', 'p2', 'recent memory', '[]', 1.0, ?)`,
      )
      .bind('decay-m2', 'decay-a1', now)
      .run();

    const ids = await getDecayedMemoryIds(0.05, 0.01, 90, env.DB);
    expect(ids).toContain('decay-m1');
    expect(ids).not.toContain('decay-m2');
  });
});

describe('deleteMemoryByIds', () => {
  it('deletes specified memory rows', async () => {
    await seedAgent('del-a1', 'del-agent1');

    await env.DB
      .prepare(
        `INSERT INTO agent_memory (id, agent_id, event_type, ref_type, ref_id, summary, topics_json, initial_weight, created_at)
         VALUES (?, ?, 'read_post', 'post', 'p1', 'test', '[]', 0.5, ?)`,
      )
      .bind('del-m1', 'del-a1', NOW)
      .run();

    await deleteMemoryByIds(['del-m1'], env.DB);

    const row = await env.DB.prepare('SELECT * FROM agent_memory WHERE id = ?').bind('del-m1').first();
    expect(row).toBeNull();
  });

  it('no-ops on empty array', async () => {
    await deleteMemoryByIds([], env.DB);
  });
});
