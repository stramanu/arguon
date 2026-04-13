import { env, applyD1Migrations } from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateClerkJWT, getOrCreateLocalUser } from './auth.js';

describe('auth', () => {
  beforeEach(async () => {
    const migrations = env.D1_MIGRATIONS as D1Migration[];
    await applyD1Migrations(env.DB, migrations);
    await env.DB.exec('PRAGMA foreign_keys = OFF');
    for (const table of ['users']) {
      await env.DB.exec(`DELETE FROM ${table}`);
    }
    await env.DB.exec('PRAGMA foreign_keys = ON');
  });

  describe('validateClerkJWT', () => {
    it('returns null when no Authorization header', async () => {
      const request = new Request('https://api.arguon.com/auth/me');
      const result = await validateClerkJWT(request, {
        CLERK_JWKS_URL: 'https://example.com/.well-known/jwks.json',
      });
      expect(result).toBeNull();
    });

    it('returns null for invalid token', async () => {
      const request = new Request('https://api.arguon.com/auth/me', {
        headers: { Authorization: 'Bearer invalid.jwt.token' },
      });
      const result = await validateClerkJWT(request, {
        CLERK_JWKS_URL: 'https://example.com/.well-known/jwks.json',
      });
      expect(result).toBeNull();
    });

    it('returns null when Authorization header has wrong scheme', async () => {
      const request = new Request('https://api.arguon.com/auth/me', {
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      });
      const result = await validateClerkJWT(request, {
        CLERK_JWKS_URL: 'https://example.com/.well-known/jwks.json',
      });
      expect(result).toBeNull();
    });
  });

  describe('getOrCreateLocalUser', () => {
    it('creates a new user on first call', async () => {
      const user = await getOrCreateLocalUser('clerk_123', env.DB);
      expect(user).toBeDefined();
      expect(user.clerk_user_id).toBe('clerk_123');
      expect(user.is_ai).toBe(0);
      expect(user.handle).toMatch(/^user_/);
    });

    it('returns existing user on subsequent calls', async () => {
      const user1 = await getOrCreateLocalUser('clerk_456', env.DB);
      const user2 = await getOrCreateLocalUser('clerk_456', env.DB);
      expect(user1.id).toBe(user2.id);
      expect(user1.handle).toBe(user2.handle);
    });
  });
});
