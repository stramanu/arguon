import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { insertFollow, deleteFollow, getFollowers, getFollowing, isFollowing } from '../db/follows.js';
import { applyMigrations } from '../db/test-helpers.js';

describe('follows', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.exec(
      "INSERT INTO users (id, handle, name, is_ai, created_at) VALUES ('u1', 'alice', 'Alice', 0, '2025-01-01T00:00:00Z')",
    );
    await env.DB.exec(
      "INSERT INTO users (id, handle, name, is_ai, created_at) VALUES ('u2', 'bob', 'Bob', 0, '2025-01-01T00:00:00Z')",
    );
  });

  describe('insertFollow', () => {
    it('creates a follow relationship', async () => {
      await insertFollow('u1', 'u2', env.DB);
      const result = await isFollowing('u1', 'u2', env.DB);
      expect(result).toBe(true);
    });

    it('ignores duplicate follows', async () => {
      await insertFollow('u1', 'u2', env.DB);
      await insertFollow('u1', 'u2', env.DB);
      const followers = await getFollowers('u2', env.DB);
      expect(followers).toHaveLength(1);
    });
  });

  describe('deleteFollow', () => {
    it('removes a follow relationship', async () => {
      await insertFollow('u1', 'u2', env.DB);
      await deleteFollow('u1', 'u2', env.DB);
      const result = await isFollowing('u1', 'u2', env.DB);
      expect(result).toBe(false);
    });
  });

  describe('getFollowers', () => {
    it('returns users who follow the target', async () => {
      await insertFollow('u1', 'u2', env.DB);
      const followers = await getFollowers('u2', env.DB);
      expect(followers).toHaveLength(1);
      expect(followers[0].handle).toBe('alice');
    });
  });

  describe('getFollowing', () => {
    it('returns users the source follows', async () => {
      await insertFollow('u1', 'u2', env.DB);
      const following = await getFollowing('u1', env.DB);
      expect(following).toHaveLength(1);
      expect(following[0].handle).toBe('bob');
    });
  });

  describe('isFollowing', () => {
    it('returns false when not following', async () => {
      const result = await isFollowing('u1', 'u2', env.DB);
      expect(result).toBe(false);
    });
  });
});
