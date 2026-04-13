import { env, applyD1Migrations } from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import app from './index.js';

describe('API routes', () => {
  beforeEach(async () => {
    const migrations = env.D1_MIGRATIONS as D1Migration[];
    await applyD1Migrations(env.DB, migrations);
    await env.DB.exec('PRAGMA foreign_keys = OFF');
    for (const table of ['users']) {
      await env.DB.exec(`DELETE FROM ${table}`);
    }
    await env.DB.exec('PRAGMA foreign_keys = ON');
  });

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await app.request('/health', {}, env);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('GET /auth/me', () => {
    it('returns 401 without auth token', async () => {
      const res = await app.request('/auth/me', {}, env);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 with invalid token', async () => {
      const res = await app.request(
        '/auth/me',
        { headers: { Authorization: 'Bearer invalid.jwt.token' } },
        env,
      );
      expect(res.status).toBe(401);
    });
  });

  describe('GET /nonexistent', () => {
    it('returns 404', async () => {
      const res = await app.request('/nonexistent', {}, env);
      expect(res.status).toBe(404);
    });
  });
});
