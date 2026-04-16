import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { insertArticle, articleExistsByHash, getRecentArticles } from '../db/articles.js';
import { applyMigrations } from '../db/test-helpers.js';
import type { RawArticle } from '../types/news.js';

function makeArticle(overrides: Partial<RawArticle> = {}): RawArticle {
  return {
    id: 'a1',
    source_id: 's1',
    url: 'https://example.com/article',
    title: 'Test Article',
    content: 'Content here',
    published_at: '2025-06-01T08:00:00Z',
    hash: 'abc123',
    topics_json: '["politics","tech"]',
    region: 'global',
    language: 'en',
    ingested_at: '2025-06-01T09:00:00Z',
    relevance_score: 0.5,
    ...overrides,
  };
}

describe('articles', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.exec(
      "INSERT INTO news_sources (id, name, url, type, language, reliability_score, is_active, consecutive_failures) VALUES ('s1', 'TestSrc', 'https://test.com', 'rss', 'en', 0.9, 1, 0)",
    );
  });

  describe('insertArticle', () => {
    it('inserts and retrieves an article', async () => {
      await insertArticle(makeArticle(), env.DB);
      const articles = await getRecentArticles(env.DB);
      expect(articles).toHaveLength(1);
      expect(articles[0].title).toBe('Test Article');
    });
  });

  describe('articleExistsByHash', () => {
    it('returns true when hash exists', async () => {
      await insertArticle(makeArticle(), env.DB);
      const exists = await articleExistsByHash('abc123', env.DB);
      expect(exists).toBe(true);
    });

    it('returns false when hash does not exist', async () => {
      const exists = await articleExistsByHash('nonexistent', env.DB);
      expect(exists).toBe(false);
    });
  });

  describe('getRecentArticles', () => {
    it('filters by language', async () => {
      await insertArticle(makeArticle({ id: 'a1', language: 'en' }), env.DB);
      await insertArticle(makeArticle({ id: 'a2', hash: 'def456', language: 'it' }), env.DB);

      const enArticles = await getRecentArticles(env.DB, { language: 'en' });
      expect(enArticles).toHaveLength(1);
      expect(enArticles[0].id).toBe('a1');
    });

    it('filters by topic', async () => {
      await insertArticle(makeArticle({ id: 'a1', topics_json: '["politics"]' }), env.DB);
      await insertArticle(makeArticle({ id: 'a2', hash: 'xyz', topics_json: '["sports"]' }), env.DB);

      const politicsArticles = await getRecentArticles(env.DB, { topic: 'politics' });
      expect(politicsArticles).toHaveLength(1);
      expect(politicsArticles[0].id).toBe('a1');
    });

    it('respects limit', async () => {
      await insertArticle(makeArticle({ id: 'a1', hash: 'h1' }), env.DB);
      await insertArticle(makeArticle({ id: 'a2', hash: 'h2' }), env.DB);
      await insertArticle(makeArticle({ id: 'a3', hash: 'h3' }), env.DB);

      const articles = await getRecentArticles(env.DB, { limit: 2 });
      expect(articles).toHaveLength(2);
    });
  });
});
