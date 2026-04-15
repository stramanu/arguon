export interface ImpressionEntry {
  post_id: string;
  dwell_ms: number;
}

/** Record which posts a user has seen, with accumulated dwell time. */
export async function recordImpressions(
  userId: string,
  entries: ImpressionEntry[],
  db: D1Database,
): Promise<void> {
  if (entries.length === 0) return;
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO user_impressions (user_id, post_id, created_at, dwell_ms)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, post_id) DO UPDATE SET dwell_ms = dwell_ms + excluded.dwell_ms`,
  );
  await db.batch(entries.map((e) => stmt.bind(userId, e.post_id, now, e.dwell_ms)));
}

/** Get post IDs that a user has already seen (within a recent window). */
export async function getSeenPostIds(
  userId: string,
  db: D1Database,
  limit = 200,
): Promise<string[]> {
  const rows = await db
    .prepare(
      'SELECT post_id FROM user_impressions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    )
    .bind(userId, limit)
    .all<{ post_id: string }>();
  return (rows.results ?? []).map((r) => r.post_id);
}

/** Get the user's top topic affinities based on reactions (strong signal) and dwell time (medium signal). */
export async function getUserTopicAffinities(
  userId: string,
  db: D1Database,
  limit = 10,
): Promise<string[]> {
  // Strong signal: topics from posts the user reacted to (weight 3)
  const reactionRows = await db
    .prepare(
      `SELECT p.tags_json FROM reactions r
       JOIN posts p ON r.target_id = p.id
       WHERE r.user_id = ? AND r.target_type = 'post' AND p.tags_json IS NOT NULL
       ORDER BY r.created_at DESC LIMIT 100`,
    )
    .bind(userId)
    .all<{ tags_json: string }>();

  // Medium signal: topics from posts with high dwell time (> 5s, weight 1)
  const dwellRows = await db
    .prepare(
      `SELECT p.tags_json FROM user_impressions i
       JOIN posts p ON i.post_id = p.id
       WHERE i.user_id = ? AND i.dwell_ms > 5000 AND p.tags_json IS NOT NULL
       ORDER BY i.dwell_ms DESC LIMIT 100`,
    )
    .bind(userId)
    .all<{ tags_json: string }>();

  const topicScore = new Map<string, number>();

  for (const row of reactionRows.results ?? []) {
    for (const tag of JSON.parse(row.tags_json) as string[]) {
      topicScore.set(tag, (topicScore.get(tag) ?? 0) + 3);
    }
  }
  for (const row of dwellRows.results ?? []) {
    for (const tag of JSON.parse(row.tags_json) as string[]) {
      topicScore.set(tag, (topicScore.get(tag) ?? 0) + 1);
    }
  }

  return [...topicScore.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic]) => topic);
}
