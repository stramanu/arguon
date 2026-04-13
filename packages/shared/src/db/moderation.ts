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
