import { env, applyD1Migrations } from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  insertArticle,
  checkBudget,
  recordUsage,
  pauseProviderIfCapped,
  insertPost,
  getPostById,
} from '@arguon/shared';
import type { Post, RawArticle } from '@arguon/shared';
import { buildPostPrompt, buildCommentPrompt, getAgreementDescription } from '@arguon/shared';
import { createLLMProvider } from '@arguon/shared';

const PERSONALITY = {
  traits: ['analytical', 'stoic'],
  editorial_stance: 'progressive',
  writing_style: 'concise',
  preferred_topics: ['technology'],
  avoided_topics: [],
  comment_style: 'brief',
  agreement_bias: 0.0,
};

const BEHAVIOR = {
  post_frequency: 'medium' as const,
  read_interval_min_minutes: 30,
  read_interval_max_minutes: 120,
  articles_per_session: 3,
  comment_probability: 0.5,
  memory_enabled: true,
  memory_decay_lambda: 0.1,
  memory_context_limit: 5,
};

const PERSONALITY_JSON = JSON.stringify(PERSONALITY);
const BEHAVIOR_JSON = JSON.stringify(BEHAVIOR);

async function seedProvider(db: D1Database) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO providers (id, name, api_base, is_active, cost_per_input_token, cost_per_output_token)
       VALUES ('anthropic', 'Anthropic', 'https://api.anthropic.com', 1, 0.000003, 0.000015)`,
    )
    .run();
}

async function seedAgent(db: D1Database, id: string) {
  await seedProvider(db);

  await db
    .prepare(
      "INSERT INTO users (id, clerk_user_id, handle, name, bio, is_ai, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
    )
    .bind(id, `clerk_${id}`, id, `Agent ${id}`, 'A test AI agent.', new Date().toISOString())
    .run();

  await db
    .prepare(
      `INSERT INTO agent_profiles (user_id, provider_id, model_id, language, personality_json, behavior_json)
       VALUES (?, 'anthropic', 'claude-haiku-4-5', 'en', ?, ?)`,
    )
    .bind(id, PERSONALITY_JSON, BEHAVIOR_JSON)
    .run();
}

function seedSource(db: D1Database) {
  return db
    .prepare(
      `INSERT INTO news_sources (id, name, url, type, language, reliability_score, is_active, consecutive_failures)
       VALUES ('src1', 'Test Source', 'https://example.com/rss', 'rss', 'en', 0.8, 1, 0)`,
    )
    .run();
}

function makeArticle(id: string): RawArticle {
  return {
    id,
    source_id: 'src1',
    url: `https://example.com/${id}`,
    title: 'AI Breakthrough in Climate Modeling',
    content: 'Scientists have developed a new AI system that can predict climate patterns with unprecedented accuracy.',
    published_at: new Date().toISOString(),
    hash: `hash_${id}`,
    topics_json: '["technology","science"]',
    region: 'US',
    language: 'en',
    ingested_at: new Date().toISOString(),
  };
}

describe('prompt-builder', () => {
  const agent = {
    name: 'Marcus',
    handle: 'marcus',
    bio: 'A stoic analyst who values facts over opinion.',
    profile: {
      user_id: 'agent1',
      provider_id: 'anthropic',
      model_id: 'claude-haiku-4-5',
      language: 'en',
      personality: PERSONALITY,
      behavior: BEHAVIOR,
      last_wake_at: null,
      next_wake_at: null,
    },
  };

  it('buildPostPrompt includes agent name and article', () => {
    const article = makeArticle('art1');
    const { system, user } = buildPostPrompt(agent, article, '');

    expect(system).toContain('Marcus');
    expect(system).toContain('@marcus');
    expect(system).toContain('analytical');
    expect(system).toContain('progressive');
    expect(user).toContain('AI Breakthrough in Climate Modeling');
    expect(user).toContain('JSON only');
  });

  it('buildPostPrompt includes memory block when provided', () => {
    const article = makeArticle('art1');
    const memoryBlock = '[posted] (memory: vivid) — Discussed climate tech advancements';
    const { user } = buildPostPrompt(agent, article, memoryBlock);

    expect(user).toContain('Your memory');
    expect(user).toContain('Discussed climate tech advancements');
  });

  it('buildPostPrompt omits memory section when empty', () => {
    const article = makeArticle('art1');
    const { user } = buildPostPrompt(agent, article, '');

    expect(user).not.toContain('Your memory');
  });

  it('buildCommentPrompt includes agreement bias description', () => {
    const post = { headline: 'AI is changing the world', summary: 'Analysis of AI trends.', authorHandle: 'aria' };
    const { system } = buildCommentPrompt(agent, post, '', '', undefined);

    expect(system).toContain('Agreement bias');
    expect(system).toContain('evaluate each argument');
  });

  it('buildCommentPrompt includes parent comment when provided', () => {
    const post = { headline: 'Test', summary: 'Test summary.', authorHandle: 'aria' };
    const parentComment = { handle: 'leo', content: 'I disagree with this take.' };
    const { user } = buildCommentPrompt(agent, post, '', '', parentComment);

    expect(user).toContain('replying to @leo');
    expect(user).toContain('I disagree with this take.');
  });
});

describe('getAgreementDescription', () => {
  it('returns contrarian for very negative bias', () => {
    expect(getAgreementDescription(-0.8)).toContain('push back');
  });

  it('returns balanced for near-zero bias', () => {
    expect(getAgreementDescription(0.0)).toContain('merits');
  });

  it('returns agreeable for high positive bias', () => {
    expect(getAgreementDescription(0.8)).toContain('common ground');
  });
});

describe('llm-provider-factory', () => {
  const keys = {
    ANTHROPIC_API_KEY: 'test-key',
    GEMINI_API_KEY: 'test-key',
    GROQ_API_KEY: 'test-key',
  };

  it('creates an AnthropicProvider for anthropic', () => {
    const provider = createLLMProvider('anthropic', 'claude-haiku-4-5', keys);
    expect(provider).toBeDefined();
    expect(provider.call).toBeTypeOf('function');
  });

  it('creates a GeminiProvider for google', () => {
    const provider = createLLMProvider('google', 'gemini-flash', keys);
    expect(provider).toBeDefined();
  });

  it('creates a GroqProvider for groq', () => {
    const provider = createLLMProvider('groq', 'llama3-70b', keys);
    expect(provider).toBeDefined();
  });

  it('throws for unknown provider', () => {
    expect(() => createLLMProvider('openai', 'gpt-4', keys)).toThrow('Unknown LLM provider');
  });
});

describe('generation-d1', () => {
  beforeEach(async () => {
    const migrations = env.D1_MIGRATIONS as D1Migration[];
    await applyD1Migrations(env.DB, migrations);
    await env.DB.exec('PRAGMA foreign_keys = OFF');
    for (const table of ['post_sources', 'comments', 'reactions', 'posts', 'raw_articles', 'news_sources', 'daily_budget', 'agent_profiles', 'users', 'providers']) {
      await env.DB.exec(`DELETE FROM ${table}`);
    }
    await env.DB.exec('PRAGMA foreign_keys = ON');
    await seedProvider(env.DB);
  });

  it('insertPost stores a post in D1', async () => {
    await seedAgent(env.DB, 'agent1');
    await seedSource(env.DB);
    await insertArticle(makeArticle('art1'), env.DB);

    const now = new Date().toISOString();
    const post: Post = {
      id: 'post1',
      agent_id: 'agent1',
      article_id: 'art1',
      headline: 'Test Headline',
      summary: 'Test summary about the article.',
      confidence_score: 80,
      tags_json: '["technology"]',
      region: 'US',
      media_json: null,
      created_at: now,
      updated_at: now,
    };

    await insertPost(post, env.DB);

    const retrieved = await getPostById('post1', env.DB);
    expect(retrieved).toBeDefined();
    expect(retrieved!.headline).toBe('Test Headline');
    expect(retrieved!.confidence_score).toBe(80);
    expect(retrieved!.agent_id).toBe('agent1');
  });

  it('post_sources can be inserted for a post', async () => {
    await seedAgent(env.DB, 'agent1');
    await seedSource(env.DB);
    await insertArticle(makeArticle('art1'), env.DB);

    const now = new Date().toISOString();
    const post: Post = {
      id: 'post2',
      agent_id: 'agent1',
      article_id: 'art1',
      headline: 'Another Headline',
      summary: 'Another summary.',
      confidence_score: 60,
      tags_json: null,
      region: null,
      media_json: null,
      created_at: now,
      updated_at: now,
    };
    await insertPost(post, env.DB);

    await env.DB
      .prepare('INSERT INTO post_sources (post_id, url, title) VALUES (?, ?, ?)')
      .bind('post2', 'https://example.com/art1', 'AI Breakthrough in Climate Modeling')
      .run();

    const sources = await env.DB
      .prepare('SELECT * FROM post_sources WHERE post_id = ?')
      .bind('post2')
      .all();

    expect(sources.results).toHaveLength(1);
    expect(sources.results[0].url).toBe('https://example.com/art1');
  });

  it('checkBudget allows when no budget record exists', async () => {
    const { allowed } = await checkBudget('anthropic', '2025-01-01', env.DB);
    expect(allowed).toBe(true);
  });

  it('checkBudget blocks when provider is paused', async () => {
    await env.DB
      .prepare(
        `INSERT INTO daily_budget (date, provider_id, tokens_used, cost_usd, cap_usd, is_paused)
         VALUES ('2025-01-01', 'anthropic', 100000, 5.0, 5.0, 1)`,
      )
      .run();

    const { allowed } = await checkBudget('anthropic', '2025-01-01', env.DB);
    expect(allowed).toBe(false);
  });

  it('recordUsage upserts budget row', async () => {
    await recordUsage('anthropic', '2025-01-01', 1000, 0.01, env.DB);
    await recordUsage('anthropic', '2025-01-01', 500, 0.005, env.DB);

    const row = await env.DB
      .prepare('SELECT * FROM daily_budget WHERE date = ? AND provider_id = ?')
      .bind('2025-01-01', 'anthropic')
      .first<{ tokens_used: number; cost_usd: number }>();

    expect(row!.tokens_used).toBe(1500);
    expect(row!.cost_usd).toBeCloseTo(0.015, 3);
  });

  it('pauseProviderIfCapped sets is_paused when over cap', async () => {
    await env.DB
      .prepare(
        `INSERT INTO daily_budget (date, provider_id, tokens_used, cost_usd, cap_usd, is_paused)
         VALUES ('2025-01-01', 'anthropic', 100000, 10.0, 5.0, 0)`,
      )
      .run();

    await pauseProviderIfCapped('anthropic', '2025-01-01', env.DB);

    const row = await env.DB
      .prepare('SELECT is_paused FROM daily_budget WHERE date = ? AND provider_id = ?')
      .bind('2025-01-01', 'anthropic')
      .first<{ is_paused: number }>();

    expect(row!.is_paused).toBe(1);
  });
});
