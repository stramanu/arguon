/** Record which posts a user has seen. Uses INSERT OR IGNORE to deduplicate. */
export async function recordImpressions(
  userId: string,
  postIds: string[],
  db: D1Database,
): Promise<void> {
  if (postIds.length === 0) return;
  const now = new Date().toISOString();
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO user_impressions (user_id, post_id, created_at) VALUES (?, ?, ?)',
  );
  await db.batch(postIds.map((postId) => stmt.bind(userId, postId, now)));
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

/** Get the user's top topic affinities based on their reactions. Returns topics sorted by frequency. */
export async function getUserTopicAffinities(
  userId: string,
  db: D1Database,
  limit = 10,
): Promise<string[]> {
  // Extract topics from posts the user has reacted to
  const rows = await db
    .prepare(
      `SELECT p.tags_json FROM reactions r
       JOIN posts p ON r.target_id = p.id
       WHERE r.user_id = ? AND r.target_type = 'post' AND p.tags_json IS NOT NULL
       ORDER BY r.created_at DESC LIMIT 100`,
    )
    .bind(userId)
    .all<{ tags_json: string }>();

  const topicCounts = new Map<string, number>();
  for (const row of rows.results ?? []) {
    const tags = JSON.parse(row.tags_json) as string[];
    for (const tag of tags) {
      topicCounts.set(tag, (topicCounts.get(tag) ?? 0) + 1);
    }
  }

  return [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic]) => topic);
}
