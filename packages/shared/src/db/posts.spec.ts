import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { getFeedPosts, getPostById, insertPost, updateConfidenceScore, getPostsByAgent, getUnseenPostsForAgent } from '../db/posts.js';
import { applyMigrations } from '../db/test-helpers.js';

const makePost = (overrides: Partial<import('../types/post.js').Post> = {}): import('../types/post.js').Post => ({
  id: 'p1',
  agent_id: 'a1',
  article_id: null,
  headline: 'Test Headline',
  summary: 'Test summary content',
  confidence_score: 0.8,
  tags_json: '["tech"]',
  region: null,
  media_json: null,
  created_at: '2025-06-01T12:00:00Z',
  updated_at: null,
  ...overrides,
});

describe('posts', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.exec(
      "INSERT INTO users (id, handle, name, is_ai, created_at) VALUES ('a1', 'marcus', 'Marcus', 1, '2025-01-01T00:00:00Z')",
    );
  });

  describe('insertPost / getPostById', () => {
    it('inserts and retrieves a post', async () => {
      await insertPost(makePost(), env.DB);
      const post = await getPostById('p1', env.DB);
      expect(post).toBeDefined();
      expect(post!.headline).toBe('Test Headline');
    });

    it('returns null for nonexistent post', async () => {
      const post = await getPostById('nonexistent', env.DB);
      expect(post).toBeNull();
    });
  });

  describe('getFeedPosts', () => {
    it('returns posts ordered by created_at DESC', async () => {
      await insertPost(makePost({ id: 'p1', created_at: '2025-06-01T12:00:00Z' }), env.DB);
      await insertPost(makePost({ id: 'p2', created_at: '2025-06-02T12:00:00Z' }), env.DB);
      await insertPost(makePost({ id: 'p3', created_at: '2025-06-03T12:00:00Z' }), env.DB);

      const posts = await getFeedPosts(env.DB, { limit: 2 });
      expect(posts).toHaveLength(2);
      expect(posts[0].id).toBe('p3');
      expect(posts[1].id).toBe('p2');
    });

    it('supports cursor-based pagination', async () => {
      await insertPost(makePost({ id: 'p1', created_at: '2025-06-01T12:00:00Z' }), env.DB);
      await insertPost(makePost({ id: 'p2', created_at: '2025-06-02T12:00:00Z' }), env.DB);

      const page = await getFeedPosts(env.DB, { cursor: '2025-06-02T12:00:00Z', limit: 10 });
      expect(page).toHaveLength(1);
      expect(page[0].id).toBe('p1');
    });
  });

  describe('updateConfidenceScore', () => {
    it('updates the confidence score', async () => {
      await insertPost(makePost(), env.DB);
      await updateConfidenceScore('p1', 0.95, env.DB);
      const post = await getPostById('p1', env.DB);
      expect(post!.confidence_score).toBe(0.95);
      expect(post!.updated_at).toBeDefined();
    });
  });

  describe('getPostsByAgent', () => {
    it('returns posts for a specific agent', async () => {
      await env.DB.exec(
        "INSERT INTO users (id, handle, name, is_ai, created_at) VALUES ('a2', 'aria', 'Aria', 1, '2025-01-01T00:00:00Z')",
      );
      await insertPost(makePost({ id: 'p1', agent_id: 'a1' }), env.DB);
      await insertPost(makePost({ id: 'p2', agent_id: 'a2' }), env.DB);

      const posts = await getPostsByAgent('a1', env.DB);
      expect(posts).toHaveLength(1);
      expect(posts[0].agent_id).toBe('a1');
    });
  });

  describe('getUnseenPostsForAgent', () => {
    it('returns posts not yet read by the agent', async () => {
      await env.DB.exec(
        "INSERT INTO users (id, handle, name, is_ai, created_at) VALUES ('a2', 'aria', 'Aria', 1, '2025-01-01T00:00:00Z')",
      );
      await insertPost(makePost({ id: 'p1', agent_id: 'a1' }), env.DB);
      await insertPost(makePost({ id: 'p2', agent_id: 'a2', created_at: '2025-06-02T12:00:00Z' }), env.DB);

      // a2 has not read any posts yet
      const unseen = await getUnseenPostsForAgent('a2', env.DB);
      expect(unseen).toHaveLength(1);
      expect(unseen[0].id).toBe('p1'); // only a1's post, not a2's own
    });

    it('excludes posts with read_post memory events', async () => {
      await env.DB.exec(
        "INSERT INTO users (id, handle, name, is_ai, created_at) VALUES ('a2', 'aria', 'Aria', 1, '2025-01-01T00:00:00Z')",
      );
      await insertPost(makePost({ id: 'p1', agent_id: 'a1' }), env.DB);

      // Mark p1 as read by a2
      await env.DB
        .prepare(
          `INSERT INTO agent_memory (id, agent_id, event_type, ref_type, ref_id, summary, initial_weight, created_at)
           VALUES (?, ?, 'read_post', 'post', ?, 'Read post', 0.4, ?)`,
        )
        .bind('m1', 'a2', 'p1', '2025-06-01T12:00:00Z')
        .run();

      const unseen = await getUnseenPostsForAgent('a2', env.DB);
      expect(unseen).toHaveLength(0);
    });
  });
});
