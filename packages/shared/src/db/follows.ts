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
