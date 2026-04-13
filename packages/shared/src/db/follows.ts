import type { Follow } from '../types/follow.js';
import type { User } from '../types/user.js';

export async function insertFollow(followerId: string, followingId: string, db: D1Database): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)')
    .bind(followerId, followingId, new Date().toISOString())
    .run();
}

export async function deleteFollow(followerId: string, followingId: string, db: D1Database): Promise<void> {
  await db
    .prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?')
    .bind(followerId, followingId)
    .run();
}

export async function getFollowers(
  userId: string,
  db: D1Database,
): Promise<User[]> {
  const rows = await db
    .prepare(
      `SELECT u.* FROM users u
       JOIN follows f ON u.id = f.follower_id
       WHERE f.following_id = ?
       ORDER BY f.created_at DESC`,
    )
    .bind(userId)
    .all<User>();
  return rows.results ?? [];
}

export async function getFollowing(
  userId: string,
  db: D1Database,
): Promise<User[]> {
  const rows = await db
    .prepare(
      `SELECT u.* FROM users u
       JOIN follows f ON u.id = f.following_id
       WHERE f.follower_id = ?
       ORDER BY f.created_at DESC`,
    )
    .bind(userId)
    .all<User>();
  return rows.results ?? [];
}

export async function isFollowing(followerId: string, followingId: string, db: D1Database): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
    .bind(followerId, followingId)
    .first<{ '1': number }>();
  return row !== null;
}

export async function getFollowersPaginated(
  userId: string,
  db: D1Database,
  limit: number,
  cursor?: string,
): Promise<{ users: User[]; next_cursor: string | null }> {
  let sql = `SELECT u.*, f.created_at AS follow_created_at FROM users u
    JOIN follows f ON u.id = f.follower_id
    WHERE f.following_id = ?`;
  const params: unknown[] = [userId];

  if (cursor) {
    sql += ' AND f.created_at < ?';
    params.push(cursor);
  }
  sql += ' ORDER BY f.created_at DESC LIMIT ?';
  params.push(limit + 1);

  const rows = await db.prepare(sql).bind(...params).all<User & { follow_created_at: string }>();
  const results = rows.results ?? [];
  const hasMore = results.length > limit;
  const page = hasMore ? results.slice(0, limit) : results;
  const next_cursor = hasMore ? page[page.length - 1].follow_created_at : null;
  return { users: page, next_cursor };
}

export async function getFollowingPaginated(
  userId: string,
  db: D1Database,
  limit: number,
  cursor?: string,
): Promise<{ users: User[]; next_cursor: string | null }> {
  let sql = `SELECT u.*, f.created_at AS follow_created_at FROM users u
    JOIN follows f ON u.id = f.following_id
    WHERE f.follower_id = ?`;
  const params: unknown[] = [userId];

  if (cursor) {
    sql += ' AND f.created_at < ?';
    params.push(cursor);
  }
  sql += ' ORDER BY f.created_at DESC LIMIT ?';
  params.push(limit + 1);

  const rows = await db.prepare(sql).bind(...params).all<User & { follow_created_at: string }>();
  const results = rows.results ?? [];
  const hasMore = results.length > limit;
  const page = hasMore ? results.slice(0, limit) : results;
  const next_cursor = hasMore ? page[page.length - 1].follow_created_at : null;
  return { users: page, next_cursor };
}

export async function getFollowCounts(
  userId: string,
  db: D1Database,
): Promise<{ follower_count: number; following_count: number }> {
  const [followers, following] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS cnt FROM follows WHERE following_id = ?').bind(userId).first<{ cnt: number }>(),
    db.prepare('SELECT COUNT(*) AS cnt FROM follows WHERE follower_id = ?').bind(userId).first<{ cnt: number }>(),
  ]);
  return {
    follower_count: followers?.cnt ?? 0,
    following_count: following?.cnt ?? 0,
  };
}
