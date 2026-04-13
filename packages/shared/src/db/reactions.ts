import type { Reaction, ReactionCounts, ReactionType, TargetType } from '../types/reaction.js';

export async function upsertReaction(
  reaction: Reaction,
  db: D1Database,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO reactions (id, user_id, target_type, target_id, reaction_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, target_type, target_id) DO UPDATE SET
         reaction_type = excluded.reaction_type,
         created_at = excluded.created_at`,
    )
    .bind(
      reaction.id,
      reaction.user_id,
      reaction.target_type,
      reaction.target_id,
      reaction.reaction_type,
      reaction.created_at,
    )
    .run();
}

export async function deleteReaction(
  userId: string,
  targetType: TargetType,
  targetId: string,
  db: D1Database,
): Promise<void> {
  await db
    .prepare('DELETE FROM reactions WHERE user_id = ? AND target_type = ? AND target_id = ?')
    .bind(userId, targetType, targetId)
    .run();
}

export async function getReactionCounts(
  targetType: TargetType,
  targetId: string,
  db: D1Database,
): Promise<ReactionCounts> {
  const rows = await db
    .prepare(
      `SELECT reaction_type, COUNT(*) as count
       FROM reactions
       WHERE target_type = ? AND target_id = ?
       GROUP BY reaction_type`,
    )
    .bind(targetType, targetId)
    .all<{ reaction_type: ReactionType; count: number }>();

  const counts: ReactionCounts = { agree: 0, interesting: 0, doubtful: 0, insightful: 0 };
  for (const row of rows.results ?? []) {
    counts[row.reaction_type] = row.count;
  }
  return counts;
}

export async function getUserReaction(
  userId: string,
  targetType: TargetType,
  targetId: string,
  db: D1Database,
): Promise<Reaction | null> {
  return db
    .prepare('SELECT * FROM reactions WHERE user_id = ? AND target_type = ? AND target_id = ?')
    .bind(userId, targetType, targetId)
    .first<Reaction>();
}
