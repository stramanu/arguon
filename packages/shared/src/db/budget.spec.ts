import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { checkBudget, recordUsage, pauseProviderIfCapped, getDailyBudget } from '../db/budget.js';
import { applyMigrations } from '../db/test-helpers.js';

describe('budget', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.exec(
      "INSERT INTO providers (id, name, api_base) VALUES ('anthropic', 'Anthropic', 'https://api.anthropic.com')",
    );
    await env.DB.exec(
      "INSERT INTO providers (id, name, api_base) VALUES ('google', 'Google', 'https://generativelanguage.googleapis.com')",
    );
  });

  describe('checkBudget', () => {
    it('allows when no budget row exists', async () => {
      const result = await checkBudget('anthropic', '2025-06-01', env.DB);
      expect(result.allowed).toBe(true);
      expect(result.budget).toBeNull();
    });

    it('blocks when paused', async () => {
      await env.DB.exec(
        "INSERT INTO daily_budget (date, provider_id, tokens_used, cost_usd, cap_usd, is_paused) VALUES ('2025-06-01', 'anthropic', 100, 0.10, 1.00, 1)",
      );
      const result = await checkBudget('anthropic', '2025-06-01', env.DB);
      expect(result.allowed).toBe(false);
    });

    it('blocks when cost exceeds cap', async () => {
      await env.DB.exec(
        "INSERT INTO daily_budget (date, provider_id, tokens_used, cost_usd, cap_usd, is_paused) VALUES ('2025-06-01', 'anthropic', 50000, 1.50, 1.00, 0)",
      );
      const result = await checkBudget('anthropic', '2025-06-01', env.DB);
      expect(result.allowed).toBe(false);
    });

    it('allows when under cap and not paused', async () => {
      await env.DB.exec(
        "INSERT INTO daily_budget (date, provider_id, tokens_used, cost_usd, cap_usd, is_paused) VALUES ('2025-06-01', 'anthropic', 1000, 0.10, 1.00, 0)",
      );
      const result = await checkBudget('anthropic', '2025-06-01', env.DB);
      expect(result.allowed).toBe(true);
      expect(result.budget).not.toBeNull();
    });
  });

  describe('recordUsage', () => {
    it('inserts new usage row', async () => {
      await recordUsage('anthropic', '2025-06-01', 1000, 0.05, env.DB);
      const budgets = await getDailyBudget('2025-06-01', env.DB);
      expect(budgets).toHaveLength(1);
      expect(budgets[0].tokens_used).toBe(1000);
      expect(budgets[0].cost_usd).toBe(0.05);
    });

    it('accumulates usage on conflict', async () => {
      await recordUsage('anthropic', '2025-06-01', 1000, 0.05, env.DB);
      await recordUsage('anthropic', '2025-06-01', 2000, 0.10, env.DB);

      const budgets = await getDailyBudget('2025-06-01', env.DB);
      expect(budgets).toHaveLength(1);
      expect(budgets[0].tokens_used).toBe(3000);
      expect(budgets[0].cost_usd).toBeCloseTo(0.15);
    });
  });

  describe('pauseProviderIfCapped', () => {
    it('pauses provider when cost exceeds cap', async () => {
      await env.DB.exec(
        "INSERT INTO daily_budget (date, provider_id, tokens_used, cost_usd, cap_usd, is_paused) VALUES ('2025-06-01', 'anthropic', 50000, 1.50, 1.00, 0)",
      );
      await pauseProviderIfCapped('anthropic', '2025-06-01', env.DB);

      const budgets = await getDailyBudget('2025-06-01', env.DB);
      expect(budgets[0].is_paused).toBe(1);
    });

    it('does not pause when under cap', async () => {
      await env.DB.exec(
        "INSERT INTO daily_budget (date, provider_id, tokens_used, cost_usd, cap_usd, is_paused) VALUES ('2025-06-01', 'anthropic', 100, 0.10, 1.00, 0)",
      );
      await pauseProviderIfCapped('anthropic', '2025-06-01', env.DB);

      const budgets = await getDailyBudget('2025-06-01', env.DB);
      expect(budgets[0].is_paused).toBe(0);
    });
  });

  describe('getDailyBudget', () => {
    it('returns all providers for a date', async () => {
      await recordUsage('anthropic', '2025-06-01', 1000, 0.05, env.DB);
      await recordUsage('google', '2025-06-01', 2000, 0.03, env.DB);

      const budgets = await getDailyBudget('2025-06-01', env.DB);
      expect(budgets).toHaveLength(2);
    });
  });
});
