import { env, applyD1Migrations } from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getActiveAgents,
  getRecentArticles,
  hasRecentlyPostedOnTopic,
  updateAgentLastWake,
  insertArticle,
  insertMemoryEvent,
} from '@arguon/shared';
import type { AgentMemory, RawArticle } from '@arguon/shared';
import { isAgentDueToWake } from './index.js';
import type { AgentProfile } from '@arguon/shared';

const PERSONALITY_JSON = JSON.stringify({
  traits: ['analytical', 'stoic'],
  editorial_stance: 'neutral',
  writing_style: 'concise',
  preferred_topics: ['technology'],
  avoided_topics: [],
  comment_style: 'brief',
  agreement_bias: 0.0,
});

const BEHAVIOR_JSON = JSON.stringify({
  post_frequency: 'medium',
  read_interval_min_minutes: 30,
  read_interval_max_minutes: 120,
  articles_per_session: 3,
  comment_probability: 0.5,
  memory_enabled: true,
  memory_decay_lambda: 0.1,
  memory_context_limit: 5,
});

async function seedProvider(db: D1Database) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO providers (id, name, api_base, is_active, cost_per_input_token, cost_per_output_token)
       VALUES ('anthropic', 'Anthropic', 'https://api.anthropic.com', 1, 0.000003, 0.000015)`,
    )
    .run();
}

async function seedAgent(db: D1Database, id: string, lastWakeAt: string | null = null) {
  await seedProvider(db);

  await db
    .prepare(
      "INSERT INTO users (id, clerk_user_id, handle, name, is_ai, created_at) VALUES (?, ?, ?, ?, 1, ?)",
    )
    .bind(id, `clerk_${id}`, id, `Agent ${id}`, new Date().toISOString())
    .run();

  await db
    .prepare(
      `INSERT INTO agent_profiles (user_id, provider_id, model_id, language, personality_json, behavior_json, last_wake_at)
       VALUES (?, 'anthropic', 'claude-haiku', 'en', ?, ?, ?)`,
    )
    .bind(id, PERSONALITY_JSON, BEHAVIOR_JSON, lastWakeAt)
    .run();
}

function seedArticle(db: D1Database, id: string, topics: string[] = ['technology']): Promise<unknown> {
  const article: RawArticle = {
    id,
    source_id: 'src1',
    url: `https://example.com/${id}`,
    title: `Article ${id}`,
    content: 'Test content for the article.',
    published_at: new Date().toISOString(),
    hash: `hash_${id}`,
    topics_json: JSON.stringify(topics),
    region: 'US',
    language: 'en',
    ingested_at: new Date().toISOString(),
  };
  return insertArticle(article, db);
}

function seedSource(db: D1Database) {
  return db
    .prepare(
      `INSERT INTO news_sources (id, name, url, type, language, reliability_score, is_active, consecutive_failures)
       VALUES ('src1', 'Test Source', 'https://example.com/rss', 'rss', 'en', 0.8, 1, 0)`,
    )
    .run();
}

describe('isAgentDueToWake', () => {
  it('returns true when agent has never woken', () => {
    const profile: AgentProfile = {
      user_id: 'agent1',
      provider_id: 'anthropic',
      model_id: 'claude-haiku',
      language: 'en',
      personality: JSON.parse(PERSONALITY_JSON),
      behavior: JSON.parse(BEHAVIOR_JSON),
      last_wake_at: null,
      next_wake_at: null,
    };

    expect(isAgentDueToWake(profile)).toBe(true);
  });

  it('returns false when agent woke very recently', () => {
    const profile: AgentProfile = {
      user_id: 'agent1',
      provider_id: 'anthropic',
      model_id: 'claude-haiku',
      language: 'en',
      personality: JSON.parse(PERSONALITY_JSON),
      behavior: {
        ...JSON.parse(BEHAVIOR_JSON),
        read_interval_min_minutes: 60,
        read_interval_max_minutes: 120,
      },
      last_wake_at: new Date().toISOString(),
      next_wake_at: null,
    };

    expect(isAgentDueToWake(profile)).toBe(false);
  });

  it('returns true when enough time has passed', () => {
    const twoHoursAgo = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    const profile: AgentProfile = {
      user_id: 'agent1',
      provider_id: 'anthropic',
      model_id: 'claude-haiku',
      language: 'en',
      personality: JSON.parse(PERSONALITY_JSON),
      behavior: {
        ...JSON.parse(BEHAVIOR_JSON),
        read_interval_min_minutes: 30,
        read_interval_max_minutes: 120,
      },
      last_wake_at: twoHoursAgo,
      next_wake_at: null,
    };

    expect(isAgentDueToWake(profile)).toBe(true);
  });
});

describe('agent-cycle-d1', () => {
  beforeEach(async () => {
    const migrations = env.D1_MIGRATIONS as D1Migration[];
    await applyD1Migrations(env.DB, migrations);
    await env.DB.exec('PRAGMA foreign_keys = OFF');
    for (const table of ['agent_memory', 'posts', 'post_sources', 'raw_articles', 'news_sources', 'agent_profiles', 'users', 'providers']) {
      await env.DB.exec(`DELETE FROM ${table}`);
    }
    await env.DB.exec('PRAGMA foreign_keys = ON');
  });

  it('getActiveAgents returns AI agents with parsed profiles', async () => {
    await seedAgent(env.DB, 'agent1');

    const agents = await getActiveAgents(env.DB);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('Agent agent1');
    expect(agents[0].profile.provider_id).toBe('anthropic');
    expect(agents[0].profile.personality.traits).toContain('analytical');
  });

  it('getActiveAgents ignores human users', async () => {
    await env.DB
      .prepare(
        "INSERT INTO users (id, clerk_user_id, handle, name, is_ai, created_at) VALUES ('human1', 'clerk_human1', 'human', 'Human', 0, ?)",
      )
      .bind(new Date().toISOString())
      .run();

    const agents = await getActiveAgents(env.DB);
    expect(agents).toHaveLength(0);
  });

  it('getRecentArticles returns articles filtered by topic', async () => {
    await seedSource(env.DB);
    await seedArticle(env.DB, 'art1', ['technology']);
    await seedArticle(env.DB, 'art2', ['sports']);

    const techArticles = await getRecentArticles(env.DB, { topic: 'technology', limit: 10 });
    expect(techArticles.length).toBeGreaterThanOrEqual(1);
    expect(techArticles.every((a) => a.topics_json?.includes('technology'))).toBe(true);
  });

  it('updateAgentLastWake persists the timestamp', async () => {
    await seedAgent(env.DB, 'agent1');
    const now = new Date().toISOString();
    await updateAgentLastWake('agent1', now, env.DB);

    const row = await env.DB
      .prepare('SELECT last_wake_at FROM agent_profiles WHERE user_id = ?')
      .bind('agent1')
      .first<{ last_wake_at: string }>();

    expect(row!.last_wake_at).toBe(now);
  });

  it('hasRecentlyPostedOnTopic guards against duplicates', async () => {
    await seedAgent(env.DB, 'agent1');
    const memory: AgentMemory = {
      id: crypto.randomUUID(),
      agent_id: 'agent1',
      event_type: 'posted',
      ref_type: 'post',
      ref_id: 'post_1',
      summary: 'Posted about tech',
      topics_json: '["technology"]',
      initial_weight: 1.0,
      created_at: new Date().toISOString(),
    };
    await insertMemoryEvent(memory, env.DB);

    const isDuplicate = await hasRecentlyPostedOnTopic('agent1', 'technology', 2, env.DB);
    expect(isDuplicate).toBe(true);

    const isNotDuplicate = await hasRecentlyPostedOnTopic('agent1', 'sports', 2, env.DB);
    expect(isNotDuplicate).toBe(false);
  });
});
