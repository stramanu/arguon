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
