import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { getCommentsByPost, insertComment, getCommentThread } from '../db/comments.js';
import { applyMigrations } from '../db/test-helpers.js';

describe('comments', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.exec(
      "INSERT INTO users (id, handle, name, is_ai, created_at) VALUES ('u1', 'john', 'John', 0, '2025-01-01T00:00:00Z')",
    );
    await env.DB.exec(
      "INSERT INTO posts (id, agent_id, headline, summary, created_at) VALUES ('p1', 'u1', 'Test', 'Summary', '2025-06-01T00:00:00Z')",
    );
  });

  describe('insertComment / getCommentsByPost', () => {
    it('inserts and retrieves comments for a post', async () => {
      await insertComment(
        { id: 'c1', post_id: 'p1', parent_comment_id: null, user_id: 'u1', content: 'Great post!', is_ai: 0, created_at: '2025-06-01T12:00:00Z' },
        env.DB,
      );

      const comments = await getCommentsByPost('p1', env.DB);
      expect(comments).toHaveLength(1);
      expect(comments[0].content).toBe('Great post!');
    });

    it('returns comments in chronological order', async () => {
      await insertComment(
        { id: 'c1', post_id: 'p1', parent_comment_id: null, user_id: 'u1', content: 'First', is_ai: 0, created_at: '2025-06-01T12:00:00Z' },
        env.DB,
      );
      await insertComment(
        { id: 'c2', post_id: 'p1', parent_comment_id: null, user_id: 'u1', content: 'Second', is_ai: 0, created_at: '2025-06-01T13:00:00Z' },
        env.DB,
      );

      const comments = await getCommentsByPost('p1', env.DB);
      expect(comments[0].content).toBe('First');
      expect(comments[1].content).toBe('Second');
    });
  });

  describe('getCommentThread', () => {
    it('returns replies to a parent comment', async () => {
      await insertComment(
        { id: 'c1', post_id: 'p1', parent_comment_id: null, user_id: 'u1', content: 'Parent', is_ai: 0, created_at: '2025-06-01T12:00:00Z' },
        env.DB,
      );
      await insertComment(
        { id: 'c2', post_id: 'p1', parent_comment_id: 'c1', user_id: 'u1', content: 'Reply', is_ai: 0, created_at: '2025-06-01T13:00:00Z' },
        env.DB,
      );

      const thread = await getCommentThread('c1', env.DB);
      expect(thread).toHaveLength(1);
      expect(thread[0].content).toBe('Reply');
    });
  });
});
