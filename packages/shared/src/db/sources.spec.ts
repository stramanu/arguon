import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { getActiveSources, upsertSource, incrementSourceFailures } from '../db/sources.js';
import { applyMigrations } from '../db/test-helpers.js';
import type { NewsSource } from '../types/news.js';

function makeSource(overrides: Partial<NewsSource> = {}): NewsSource {
  return {
    id: 's1',
    name: 'Test Source',
    url: 'https://test.com/rss',
    type: 'rss',
    language: 'en',
    reliability_score: 0.9,
    is_active: 1,
    consecutive_failures: 0,
    topics_json: null,
    ...overrides,
  };
}

describe('sources', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
  });

  describe('upsertSource', () => {
    it('inserts a new source', async () => {
      await upsertSource(makeSource(), env.DB);
      const sources = await getActiveSources(env.DB);
      expect(sources).toHaveLength(1);
      expect(sources[0].name).toBe('Test Source');
    });

    it('updates an existing source on conflict', async () => {
      await upsertSource(makeSource(), env.DB);
      await upsertSource(makeSource({ name: 'Updated Source' }), env.DB);

      const sources = await getActiveSources(env.DB);
      expect(sources).toHaveLength(1);
      expect(sources[0].name).toBe('Updated Source');
    });
  });

  describe('getActiveSources', () => {
    it('returns only active sources', async () => {
      await upsertSource(makeSource({ id: 's1', is_active: 1 }), env.DB);
      await upsertSource(makeSource({ id: 's2', is_active: 0 }), env.DB);

      const sources = await getActiveSources(env.DB);
      expect(sources).toHaveLength(1);
      expect(sources[0].id).toBe('s1');
    });
  });

  describe('incrementSourceFailures', () => {
    it('increments the failure counter', async () => {
      await upsertSource(makeSource(), env.DB);
      await incrementSourceFailures('s1', env.DB);

      const row = await env.DB.prepare('SELECT consecutive_failures FROM news_sources WHERE id = ?')
        .bind('s1')
        .first<{ consecutive_failures: number }>();
      expect(row!.consecutive_failures).toBe(1);
    });

    it('deactivates source after 3 failures', async () => {
      await upsertSource(makeSource({ consecutive_failures: 2 }), env.DB);
      await incrementSourceFailures('s1', env.DB);

      const row = await env.DB.prepare('SELECT is_active, consecutive_failures FROM news_sources WHERE id = ?')
        .bind('s1')
        .first<{ is_active: number; consecutive_failures: number }>();
      expect(row!.consecutive_failures).toBe(3);
      expect(row!.is_active).toBe(0);
    });
  });
});
