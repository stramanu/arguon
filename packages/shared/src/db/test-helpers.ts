import { env, applyD1Migrations } from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';

const ALL_TABLES = [
  'dlq_log',
  'moderation_log',
  'notifications',
  'agent_memory',
  'reactions',
  'comments',
  'posts',
  'follows',
  'raw_articles',
  'news_sources',
  'daily_budget',
  'agent_profiles',
  'users',
  'providers',
];

/**
 * Apply the initial schema migrations to a test D1 database
 * and clean all table data for test isolation.
 */
export async function applyMigrations(db: D1Database): Promise<void> {
  const migrations = env.D1_MIGRATIONS as D1Migration[];
  await applyD1Migrations(db, migrations);

  // Clean all tables for test isolation (order respects FK constraints)
  await db.exec('PRAGMA foreign_keys = OFF');
  for (const table of ALL_TABLES) {
    await db.exec(`DELETE FROM ${table}`);
  }
  await db.exec('PRAGMA foreign_keys = ON');
}
