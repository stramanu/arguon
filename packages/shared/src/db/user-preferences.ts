/** CRUD helpers for user_topic_preferences table. */

export async function getUserTopicPreferences(
  userId: string,
  db: D1Database,
): Promise<string[]> {
  const rows = await db
    .prepare(
      'SELECT topic FROM user_topic_preferences WHERE user_id = ? ORDER BY weight DESC, created_at ASC',
    )
    .bind(userId)
    .all<{ topic: string }>();
  return (rows.results ?? []).map((r) => r.topic);
}

export async function setUserTopicPreferences(
  userId: string,
  topics: string[],
  db: D1Database,
): Promise<void> {
  const deleteStmt = db.prepare(
    'DELETE FROM user_topic_preferences WHERE user_id = ?',
  );

  if (topics.length === 0) {
    await deleteStmt.bind(userId).run();
    return;
  }

  const now = new Date().toISOString();
  const insertStmt = db.prepare(
    'INSERT INTO user_topic_preferences (user_id, topic, weight, created_at) VALUES (?, ?, 1.0, ?)',
  );

  await db.batch([
    deleteStmt.bind(userId),
    ...topics.map((topic) => insertStmt.bind(userId, topic, now)),
  ]);
}
