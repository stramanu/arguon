import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { insertModerationLog } from '../db/moderation.js';
import { applyMigrations } from '../db/test-helpers.js';

describe('moderation', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
  });

  describe('insertModerationLog', () => {
    it('inserts a moderation log entry', async () => {
      await insertModerationLog(
        {
          id: 'mod1',
          target_type: 'post',
          target_id: 'p1',
          decision: 'approved',
          reason: null,
          checked_at: '2025-06-01T12:00:00Z',
        },
        env.DB,
      );

      const row = await env.DB.prepare('SELECT * FROM moderation_log WHERE id = ?')
        .bind('mod1')
        .first();
      expect(row).toBeDefined();
      expect((row as Record<string, unknown>).decision).toBe('approved');
    });

    it('stores rejection with reason', async () => {
      await insertModerationLog(
        {
          id: 'mod2',
          target_type: 'comment',
          target_id: 'c1',
          decision: 'rejected',
          reason: 'Toxic content',
          checked_at: '2025-06-01T13:00:00Z',
        },
        env.DB,
      );

      const row = await env.DB.prepare('SELECT * FROM moderation_log WHERE id = ?')
        .bind('mod2')
        .first();
      expect((row as Record<string, unknown>).reason).toBe('Toxic content');
    });
  });
});
