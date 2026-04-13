import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { insertDlqEntry } from '../db/dlq.js';
import { applyMigrations } from '../db/test-helpers.js';

describe('dlq', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
  });

  describe('insertDlqEntry', () => {
    it('inserts a DLQ entry', async () => {
      await insertDlqEntry(
        {
          id: 'dlq1',
          queue_name: 'generation-queue',
          payload_json: '{"agent_id":"a1"}',
          error: 'Rate limit exceeded',
          failed_at: '2025-06-01T12:00:00Z',
          retry_count: 3,
        },
        env.DB,
      );

      const row = await env.DB.prepare('SELECT * FROM dlq_log WHERE id = ?')
        .bind('dlq1')
        .first();
      expect(row).toBeDefined();
      expect((row as Record<string, unknown>).queue_name).toBe('generation-queue');
      expect((row as Record<string, unknown>).retry_count).toBe(3);
    });

    it('handles null error field', async () => {
      await insertDlqEntry(
        {
          id: 'dlq2',
          queue_name: 'comment-queue',
          payload_json: '{}',
          error: null,
          failed_at: '2025-06-01T13:00:00Z',
          retry_count: 0,
        },
        env.DB,
      );

      const row = await env.DB.prepare('SELECT * FROM dlq_log WHERE id = ?')
        .bind('dlq2')
        .first();
      expect((row as Record<string, unknown>).error).toBeNull();
    });
  });
});
