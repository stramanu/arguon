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
