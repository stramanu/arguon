import type { DlqEntry } from '../types/moderation.js';

export async function insertDlqEntry(entry: DlqEntry, db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO dlq_log (id, queue_name, payload_json, error, failed_at, retry_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(entry.id, entry.queue_name, entry.payload_json, entry.error, entry.failed_at, entry.retry_count)
    .run();
}

export async function getDlqEntries(
  limit: number,
  cursor: string | undefined,
  db: D1Database,
): Promise<{ entries: DlqEntry[]; next_cursor: string | null }> {
  const fetchLimit = limit + 1;
  let query = 'SELECT * FROM dlq_log';
  const bindings: unknown[] = [];

  if (cursor) {
    query += ' WHERE failed_at < ?';
    bindings.push(cursor);
  }

  query += ' ORDER BY failed_at DESC LIMIT ?';
  bindings.push(fetchLimit);

  const rows = await db
    .prepare(query)
    .bind(...bindings)
    .all<DlqEntry>();

  const results = rows.results ?? [];
  const hasMore = results.length > limit;
  const entries = hasMore ? results.slice(0, limit) : results;
  const next_cursor = hasMore ? entries[entries.length - 1].failed_at : null;

  return { entries, next_cursor };
}
