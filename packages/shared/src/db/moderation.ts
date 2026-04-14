import type { ModerationLog } from '../types/moderation.js';

export async function insertModerationLog(log: ModerationLog, db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO moderation_log (id, target_type, target_id, decision, reason, checked_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(log.id, log.target_type, log.target_id, log.decision, log.reason, log.checked_at)
    .run();
}

export async function getModerationLogs(
  limit: number,
  cursor: string | undefined,
  decision: string | undefined,
  db: D1Database,
): Promise<{ logs: ModerationLog[]; next_cursor: string | null }> {
  const fetchLimit = limit + 1;
  let query = 'SELECT * FROM moderation_log';
  const conditions: string[] = [];
  const bindings: unknown[] = [];

  if (decision) {
    conditions.push('decision = ?');
    bindings.push(decision);
  }
  if (cursor) {
    conditions.push('checked_at < ?');
    bindings.push(cursor);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ' ORDER BY checked_at DESC LIMIT ?';
  bindings.push(fetchLimit);

  const rows = await db
    .prepare(query)
    .bind(...bindings)
    .all<ModerationLog>();

  const results = rows.results ?? [];
  const hasMore = results.length > limit;
  const logs = hasMore ? results.slice(0, limit) : results;
  const next_cursor = hasMore ? logs[logs.length - 1].checked_at : null;

  return { logs, next_cursor };
}
