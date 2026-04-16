import { env, applyD1Migrations } from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { tagTopics } from './topic-tagger.js';
import { detectRegion } from './region-detector.js';
import { extractItems, stripHtml } from './rss-parser.js';
import { hashUrl, normalizeArticle } from './normalizer.js';
import {
  insertArticle,
  articleExistsByHash,
  getActiveSources,
  incrementSourceFailures,
} from '@arguon/shared';

describe('topic-tagger', () => {
  // --- Basic topic detection ---

  it('detects technology topic', () => {
    const topics = tagTopics('New AI breakthrough transforms software industry', null);
    expect(topics).toContain('technology');
  });

  it('detects multiple topics', () => {
    const topics = tagTopics(
      'Climate change threatens health systems globally',
      'The economy is affected by environmental pollution',
    );
    expect(topics.length).toBeGreaterThanOrEqual(2);
  });

  it('returns max 3 topics', () => {
    const topics = tagTopics(
      'Climate health sports technology science economy',
      'war protest art streaming nasa vaccine stock market',
    );
    expect(topics.length).toBeLessThanOrEqual(3);
  });

  it('returns empty array for unrelated content', () => {
    const topics = tagTopics('Lorem ipsum dolor sit amet', null);
    expect(topics).toEqual([]);
  });

  // --- Title weighting (3× vs 1×) ---

  it('prioritizes title matches over content matches', () => {
    const topics = tagTopics(
      'NASA discovers new asteroid near Mars',
      'The stock market reacted to inflation data and trade policy updates from the fed',
    );
    expect(topics[0]).toBe('science');
  });

  it('title keyword alone outweighs multiple content keywords', () => {
    const topics = tagTopics(
      'New vaccine approved for cancer treatment',
      'The tech startup announced a software algorithm for cloud data processing',
    );
    // health has 3 title matches (vaccine, cancer, treatment) = 9 pts
    // technology has 5 content matches (tech, startup, software, algorithm, cloud) = 5 pts
    expect(topics[0]).toBe('health');
  });

  // --- Primary topic is always index 0 ---

  it('returns primary topic (highest score) as first element', () => {
    const topics = tagTopics(
      'Olympic basketball tournament breaks records',
      'The league match had a record number of goals',
    );
    expect(topics[0]).toBe('sports');
  });

  // --- Geopolitics keyword refinement (no cross-contamination) ---

  it('does not tag tech policy as geopolitics when no geopolitics keywords present', () => {
    const topics = tagTopics(
      'Tech companies face new digital regulation',
      'Software industry adapts to algorithm transparency requirements',
    );
    expect(topics).toContain('technology');
    expect(topics).not.toContain('geopolitics');
  });

  it('does not tag health regulation as geopolitics', () => {
    const topics = tagTopics(
      'New public health policy announced for vaccine distribution',
      'Hospital systems prepare for the upcoming outbreak season',
    );
    expect(topics[0]).toBe('health');
    expect(topics).not.toContain('geopolitics');
  });

  it('correctly tags actual geopolitics articles', () => {
    const topics = tagTopics(
      'NATO deploys military forces amid border conflict',
      'Diplomacy efforts stall as sanctions are expanded',
    );
    expect(topics[0]).toBe('geopolitics');
  });

  it('tags war and invasion as geopolitics, not something else', () => {
    const topics = tagTopics(
      'Ceasefire collapses as invasion resumes in occupied territory',
      null,
    );
    expect(topics).toContain('geopolitics');
  });

  // --- Edge cases: cross-domain articles ---

  it('tags a tech economy article correctly', () => {
    const topics = tagTopics(
      'AI startup raises record investment on Wall Street',
      'The semiconductor company saw its stock surge after the algorithm breakthrough',
    );
    expect(topics).toContain('technology');
    expect(topics).toContain('economy');
  });

  it('tags environment + science article correctly', () => {
    const topics = tagTopics(
      'Climate research reveals glacier melting accelerates',
      'New study uses telescope data to track carbon emissions and biodiversity loss',
    );
    expect(topics).toContain('environment');
    expect(topics).toContain('science');
  });

  it('tags sports article without economy leaking in', () => {
    const topics = tagTopics(
      'FIFA World Cup final draws record viewership',
      'The tournament champion celebrated after the match with fans at the stadium',
    );
    expect(topics[0]).toBe('sports');
    expect(topics).not.toContain('economy');
  });

  it('tags entertainment article correctly', () => {
    const topics = tagTopics(
      'Netflix series breaks streaming records globally',
      'The celebrity-studded show had gaming and podcast tie-ins on YouTube',
    );
    expect(topics[0]).toBe('entertainment');
  });

  // --- Null/empty content handling ---

  it('works with null content', () => {
    const topics = tagTopics('Mars research discovery by NASA', null);
    expect(topics).toContain('science');
  });

  it('works with empty content', () => {
    const topics = tagTopics('Olympic champion wins basketball gold', '');
    expect(topics).toContain('sports');
  });

  // --- Content truncation (only first 200 chars) ---

  it('ignores content beyond 200 characters', () => {
    const padding = 'x'.repeat(200);
    const topics = tagTopics(
      'Generic news headline with no keywords',
      padding + ' war conflict military nato invasion',
    );
    // geopolitics keywords are beyond 200 chars, should not be detected
    expect(topics).not.toContain('geopolitics');
  });
});

describe('region-detector', () => {
  it('detects country name in title', () => {
    expect(detectRegion('Tensions rise in Ukraine amid military buildup')).toBe('UA');
  });

  it('detects abbreviated country', () => {
    expect(detectRegion('USA announces new trade policy')).toBe('US');
  });

  it('returns null for no match', () => {
    expect(detectRegion('Lorem ipsum dolor sit amet')).toBeNull();
  });

  it('prefers longer match over shorter', () => {
    expect(detectRegion('South Korea launches new space program')).toBe('KR');
  });
});

describe('rss-parser', () => {
  it('extracts items from RSS XML', () => {
    const xml = `
      <rss>
        <channel>
          <item>
            <title>Test Article</title>
            <link>https://example.com/article1</link>
            <description>Article description</description>
            <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>
    `;
    const items = extractItems(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Test Article');
    expect(items[0].url).toBe('https://example.com/article1');
    expect(items[0].content).toBe('Article description');
    expect(items[0].publishedAt).toBeTruthy();
  });

  it('handles CDATA sections', () => {
    const xml = `
      <rss>
        <channel>
          <item>
            <title><![CDATA[<b>Bold</b> Title]]></title>
            <link>https://example.com/article2</link>
          </item>
        </channel>
      </rss>
    `;
    const items = extractItems(xml);
    expect(items[0].title).toBe('Bold Title');
  });

  it('strips HTML tags and decodes entities', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
    expect(stripHtml('Test &amp; value')).toBe('Test & value');
    expect(stripHtml('A &lt; B &gt; C')).toBe('A < B > C');
  });

  it('skips items without title or url', () => {
    const xml = `
      <rss>
        <channel>
          <item>
            <description>No title or link here</description>
          </item>
        </channel>
      </rss>
    `;
    const items = extractItems(xml);
    expect(items).toHaveLength(0);
  });

  it('extracts multiple items', () => {
    const xml = `
      <rss>
        <channel>
          <item>
            <title>First</title>
            <link>https://example.com/1</link>
          </item>
          <item>
            <title>Second</title>
            <link>https://example.com/2</link>
          </item>
        </channel>
      </rss>
    `;
    const items = extractItems(xml);
    expect(items).toHaveLength(2);
  });
});

describe('normalizer', () => {
  it('produces consistent SHA-256 hash for same URL', async () => {
    const hash1 = await hashUrl('https://example.com/article');
    const hash2 = await hashUrl('https://example.com/article');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('produces different hashes for different URLs', async () => {
    const hash1 = await hashUrl('https://example.com/article1');
    const hash2 = await hashUrl('https://example.com/article2');
    expect(hash1).not.toBe(hash2);
  });

  it('creates a valid RawArticle', () => {
    const article = normalizeArticle(
      {
        title: 'Tech in Ukraine',
        url: 'https://example.com',
        content: 'AI and software developments',
        publishedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'src1',
        name: 'Test Source',
        url: '',
        type: 'rss',
        language: 'en',
        reliability_score: 0.8,
        is_active: 1,
        consecutive_failures: 0,
        topics_json: null,
      },
      'abc123hash',
    );
    expect(article.source_id).toBe('src1');
    expect(article.hash).toBe('abc123hash');
    expect(article.language).toBe('en');
    expect(article.id).toBeTruthy();
    expect(article.topics_json).toContain('technology');
    expect(article.region).toBe('UA');
  });
});

describe('deduplication', () => {
  beforeEach(async () => {
    const migrations = env.D1_MIGRATIONS as D1Migration[];
    await applyD1Migrations(env.DB, migrations);
    await env.DB.exec('PRAGMA foreign_keys = OFF');
    for (const table of ['raw_articles', 'news_sources']) {
      await env.DB.exec(`DELETE FROM ${table}`);
    }
    await env.DB.exec('PRAGMA foreign_keys = ON');
  });

  it('detects existing article by hash', async () => {
    await env.DB
      .prepare(
        'INSERT INTO news_sources (id, name, url, type, language, reliability_score, is_active, consecutive_failures) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind('src1', 'Test', 'http://example.com', 'rss', 'en', 0.8, 1, 0)
      .run();

    const article = {
      id: 'art1',
      source_id: 'src1',
      url: 'https://example.com/a',
      title: 'Test',
      content: null,
      published_at: null,
      hash: 'unique-hash-123',
      topics_json: null,
      region: null,
      language: 'en',
      ingested_at: new Date().toISOString(),
    };
    await insertArticle(article, env.DB);

    expect(await articleExistsByHash('unique-hash-123', env.DB)).toBe(true);
    expect(await articleExistsByHash('nonexistent', env.DB)).toBe(false);
  });
});

describe('source-failure-handling', () => {
  beforeEach(async () => {
    const migrations = env.D1_MIGRATIONS as D1Migration[];
    await applyD1Migrations(env.DB, migrations);
    await env.DB.exec('PRAGMA foreign_keys = OFF');
    for (const table of ['raw_articles', 'news_sources']) {
      await env.DB.exec(`DELETE FROM ${table}`);
    }
    await env.DB.exec('PRAGMA foreign_keys = ON');
  });

  it('increments consecutive failures', async () => {
    await env.DB
      .prepare(
        'INSERT INTO news_sources (id, name, url, type, language, reliability_score, is_active, consecutive_failures) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind('src1', 'Test', 'http://example.com', 'rss', 'en', 0.8, 1, 0)
      .run();

    await incrementSourceFailures('src1', env.DB);

    const row = await env.DB
      .prepare("SELECT consecutive_failures FROM news_sources WHERE id = 'src1'")
      .first<{ consecutive_failures: number }>();
    expect(row!.consecutive_failures).toBe(1);
  });

  it('deactivates source after 3 failures', async () => {
    await env.DB
      .prepare(
        'INSERT INTO news_sources (id, name, url, type, language, reliability_score, is_active, consecutive_failures) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind('src1', 'Test', 'http://example.com', 'rss', 'en', 0.8, 1, 2)
      .run();

    await incrementSourceFailures('src1', env.DB);

    const row = await env.DB
      .prepare("SELECT is_active, consecutive_failures FROM news_sources WHERE id = 'src1'")
      .first<{ is_active: number; consecutive_failures: number }>();
    expect(row!.consecutive_failures).toBe(3);
    expect(row!.is_active).toBe(0);
  });

  it('getActiveSources excludes deactivated sources', async () => {
    await env.DB
      .prepare(
        'INSERT INTO news_sources (id, name, url, type, language, reliability_score, is_active, consecutive_failures) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind('active', 'Active', 'http://a.com', 'rss', 'en', 0.8, 1, 0)
      .run();
    await env.DB
      .prepare(
        'INSERT INTO news_sources (id, name, url, type, language, reliability_score, is_active, consecutive_failures) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind('inactive', 'Inactive', 'http://b.com', 'rss', 'en', 0.8, 0, 3)
      .run();

    const sources = await getActiveSources(env.DB);
    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe('active');
  });
});
