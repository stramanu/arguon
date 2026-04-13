import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { getUserById, getUserByHandle, getUserByClerkId, upsertUser, updateUser } from '../db/users.js';
import { applyMigrations } from '../db/test-helpers.js';

describe('users', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
  });

  const testUser = {
    id: 'u1',
    clerk_user_id: 'clerk_abc',
    handle: 'john',
    name: 'John Doe',
    avatar_url: 'https://example.com/avatar.png',
    bio: 'A test user',
    is_ai: 0,
    is_verified_ai: 0,
    created_at: '2025-01-01T00:00:00Z',
  };

  describe('upsertUser', () => {
    it('inserts a new user', async () => {
      await upsertUser(testUser, env.DB);
      const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind('u1').first();
      expect(row).toBeDefined();
      expect(row!.handle).toBe('john');
    });

    it('updates on conflict', async () => {
      await upsertUser(testUser, env.DB);
      await upsertUser({ ...testUser, name: 'John Updated' }, env.DB);
      const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind('u1').first();
      expect(row!.name).toBe('John Updated');
    });
  });

  describe('getUserById', () => {
    it('returns user when exists', async () => {
      await upsertUser(testUser, env.DB);
      const user = await getUserById('u1', env.DB);
      expect(user).toBeDefined();
      expect(user!.name).toBe('John Doe');
    });

    it('returns null when not found', async () => {
      const user = await getUserById('nonexistent', env.DB);
      expect(user).toBeNull();
    });
  });

  describe('getUserByHandle', () => {
    it('returns user when handle exists', async () => {
      await upsertUser(testUser, env.DB);
      const user = await getUserByHandle('john', env.DB);
      expect(user).toBeDefined();
      expect(user!.id).toBe('u1');
    });

    it('returns null when handle not found', async () => {
      const user = await getUserByHandle('unknown', env.DB);
      expect(user).toBeNull();
    });
  });

  describe('getUserByClerkId', () => {
    it('returns user when clerk_user_id exists', async () => {
      await upsertUser(testUser, env.DB);
      const user = await getUserByClerkId('clerk_abc', env.DB);
      expect(user).toBeDefined();
      expect(user!.handle).toBe('john');
    });

    it('returns null when clerk_user_id not found', async () => {
      const user = await getUserByClerkId('nonexistent', env.DB);
      expect(user).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('updates specified fields', async () => {
      await upsertUser(testUser, env.DB);
      await updateUser('u1', { name: 'Jane Doe', bio: 'Updated bio' }, env.DB);
      const user = await getUserById('u1', env.DB);
      expect(user!.name).toBe('Jane Doe');
      expect(user!.bio).toBe('Updated bio');
      expect(user!.handle).toBe('john'); // unchanged
    });

    it('does nothing when no fields provided', async () => {
      await upsertUser(testUser, env.DB);
      await updateUser('u1', {}, env.DB);
      const user = await getUserById('u1', env.DB);
      expect(user!.name).toBe('John Doe');
    });
  });
});
