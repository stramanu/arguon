import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { getAgentProfile, getActiveAgents, getAgentLastWake, updateAgentLastWake, createAgent } from '../db/agents.js';
import { applyMigrations } from '../db/test-helpers.js';

const personality = {
  traits: ['analytical'],
  editorial_stance: 'neutral',
  writing_style: 'concise',
  preferred_topics: ['technology'],
  avoided_topics: [],
  comment_style: 'constructive',
  agreement_bias: 0.5,
};

const behavior = {
  post_frequency: 'medium' as const,
  read_interval_min_minutes: 30,
  read_interval_max_minutes: 90,
  articles_per_session: 5,
  comment_probability: 0.3,
  memory_enabled: true,
  memory_decay_lambda: 0.1,
  memory_context_limit: 10,
};

describe('agents', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    // Insert a provider
    await env.DB.exec(
      "INSERT INTO providers (id, name, api_base) VALUES ('anthropic', 'Anthropic', 'https://api.anthropic.com')",
    );
  });

  describe('createAgent', () => {
    it('inserts user and agent_profiles rows in a batch', async () => {
      await createAgent(
        { id: 'a1', handle: 'marcus', name: 'Marcus', avatar_url: null, bio: 'An AI agent', created_at: '2025-01-01T00:00:00Z' },
        { provider_id: 'anthropic', model_id: 'claude-sonnet-4-20250514', language: 'en', personality, behavior },
        env.DB,
      );

      const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind('a1').first();
      expect(user).toBeDefined();
      expect(user!.is_ai).toBe(1);
      expect(user!.handle).toBe('marcus');

      const profile = await env.DB.prepare('SELECT * FROM agent_profiles WHERE user_id = ?').bind('a1').first();
      expect(profile).toBeDefined();
      expect(profile!.model_id).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('getAgentProfile', () => {
    it('returns parsed profile', async () => {
      await createAgent(
        { id: 'a1', handle: 'marcus', name: 'Marcus', avatar_url: null, bio: null, created_at: '2025-01-01T00:00:00Z' },
        { provider_id: 'anthropic', model_id: 'claude-sonnet-4-20250514', language: 'en', personality, behavior },
        env.DB,
      );

      const profile = await getAgentProfile('a1', env.DB);
      expect(profile).toBeDefined();
      expect(profile!.personality.traits).toEqual(['analytical']);
      expect(profile!.behavior.post_frequency).toBe('medium');
    });

    it('returns null when not found', async () => {
      const profile = await getAgentProfile('nonexistent', env.DB);
      expect(profile).toBeNull();
    });
  });

  describe('getActiveAgents', () => {
    it('returns all AI agents with profiles', async () => {
      await createAgent(
        { id: 'a1', handle: 'marcus', name: 'Marcus', avatar_url: null, bio: null, created_at: '2025-01-01T00:00:00Z' },
        { provider_id: 'anthropic', model_id: 'claude-sonnet-4-20250514', language: 'en', personality, behavior },
        env.DB,
      );
      await createAgent(
        { id: 'a2', handle: 'aria', name: 'Aria', avatar_url: null, bio: null, created_at: '2025-01-01T00:00:00Z' },
        { provider_id: 'anthropic', model_id: 'claude-sonnet-4-20250514', language: 'en', personality, behavior },
        env.DB,
      );

      const agents = await getActiveAgents(env.DB);
      expect(agents).toHaveLength(2);
      expect(agents[0].profile).toBeDefined();
    });
  });

  describe('getAgentLastWake / updateAgentLastWake', () => {
    it('returns null initially, then updated value', async () => {
      await createAgent(
        { id: 'a1', handle: 'marcus', name: 'Marcus', avatar_url: null, bio: null, created_at: '2025-01-01T00:00:00Z' },
        { provider_id: 'anthropic', model_id: 'claude-sonnet-4-20250514', language: 'en', personality, behavior },
        env.DB,
      );

      const initial = await getAgentLastWake('a1', env.DB);
      expect(initial).toBeNull();

      await updateAgentLastWake('a1', '2025-06-01T12:00:00Z', '2025-06-01T13:00:00Z', env.DB);
      const updated = await getAgentLastWake('a1', env.DB);
      expect(updated).toBe('2025-06-01T12:00:00Z');
    });
  });
});
