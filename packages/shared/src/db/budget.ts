import type { DailyBudget } from '../types/budget.js';

export async function checkBudget(
  providerId: string,
  date: string,
  db: D1Database,
): Promise<{ allowed: boolean; budget: DailyBudget | null }> {
  const budget = await db
    .prepare('SELECT * FROM daily_budget WHERE date = ? AND provider_id = ?')
    .bind(date, providerId)
    .first<DailyBudget>();

  if (!budget) return { allowed: true, budget: null };
  if (budget.is_paused) return { allowed: false, budget };
  if (budget.cost_usd >= budget.cap_usd) return { allowed: false, budget };

  return { allowed: true, budget };
}

export async function recordUsage(
  providerId: string,
  date: string,
  tokensUsed: number,
  costUsd: number,
  db: D1Database,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO daily_budget (date, provider_id, tokens_used, cost_usd, cap_usd, is_paused)
       VALUES (?, ?, ?, ?, 1.00, 0)
       ON CONFLICT(date, provider_id) DO UPDATE SET
         tokens_used = daily_budget.tokens_used + excluded.tokens_used,
         cost_usd = daily_budget.cost_usd + excluded.cost_usd`,
    )
    .bind(date, providerId, tokensUsed, costUsd)
    .run();
}

export async function pauseProviderIfCapped(
  providerId: string,
  date: string,
  db: D1Database,
): Promise<void> {
  await db
    .prepare(
      `UPDATE daily_budget SET is_paused = 1
       WHERE date = ? AND provider_id = ? AND cost_usd >= cap_usd`,
    )
    .bind(date, providerId)
    .run();
}

export async function getDailyBudget(
  date: string,
  db: D1Database,
): Promise<DailyBudget[]> {
  const rows = await db
    .prepare('SELECT * FROM daily_budget WHERE date = ?')
    .bind(date)
    .all<DailyBudget>();
  return rows.results ?? [];
}

export async function getBudgetWithProviders(
  date: string,
  db: D1Database,
): Promise<Array<{ provider_id: string; provider_name: string; tokens_used: number; cost_usd: number; cap_usd: number; is_paused: number }>> {
  const rows = await db
    .prepare(
      `SELECT p.id AS provider_id, p.name AS provider_name,
              COALESCE(b.tokens_used, 0) AS tokens_used,
              COALESCE(b.cost_usd, 0) AS cost_usd,
              COALESCE(b.cap_usd, 1.0) AS cap_usd,
              COALESCE(b.is_paused, 0) AS is_paused
       FROM providers p
       LEFT JOIN daily_budget b ON b.provider_id = p.id AND b.date = ?
       WHERE p.is_active = 1
       ORDER BY p.name`,
    )
    .bind(date)
    .all<{ provider_id: string; provider_name: string; tokens_used: number; cost_usd: number; cap_usd: number; is_paused: number }>();
  return rows.results ?? [];
}

export async function updateBudgetCap(
  providerId: string,
  date: string,
  capUsd: number,
  db: D1Database,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO daily_budget (date, provider_id, tokens_used, cost_usd, cap_usd, is_paused)
       VALUES (?, ?, 0, 0, ?, 0)
       ON CONFLICT(date, provider_id) DO UPDATE SET cap_usd = excluded.cap_usd`,
    )
    .bind(date, providerId, capUsd)
    .run();
}

export async function setBudgetPaused(
  providerId: string,
  date: string,
  paused: boolean,
  db: D1Database,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO daily_budget (date, provider_id, tokens_used, cost_usd, cap_usd, is_paused)
       VALUES (?, ?, 0, 0, 1.0, ?)
       ON CONFLICT(date, provider_id) DO UPDATE SET is_paused = excluded.is_paused`,
    )
    .bind(date, providerId, paused ? 1 : 0)
    .run();
}
