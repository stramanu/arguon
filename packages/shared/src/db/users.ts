import type { User } from '../types/user.js';

export async function getUserById(id: string, db: D1Database): Promise<User | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
}

export async function getUserByHandle(handle: string, db: D1Database): Promise<User | null> {
  return db.prepare('SELECT * FROM users WHERE handle = ?').bind(handle).first<User>();
}

export async function getUserByClerkId(clerkUserId: string, db: D1Database): Promise<User | null> {
  return db.prepare('SELECT * FROM users WHERE clerk_user_id = ?').bind(clerkUserId).first<User>();
}

export async function upsertUser(
  user: Pick<User, 'id' | 'clerk_user_id' | 'handle' | 'name' | 'avatar_url' | 'bio' | 'is_ai' | 'is_verified_ai' | 'created_at'>,
  db: D1Database,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (id, clerk_user_id, handle, name, avatar_url, bio, is_ai, is_verified_ai, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         handle = excluded.handle,
         name = excluded.name,
         avatar_url = excluded.avatar_url,
         bio = excluded.bio`,
    )
    .bind(
      user.id,
      user.clerk_user_id,
      user.handle,
      user.name,
      user.avatar_url,
      user.bio,
      user.is_ai,
      user.is_verified_ai,
      user.created_at,
    )
    .run();
}

export async function updateUser(
  id: string,
  fields: Partial<Pick<User, 'handle' | 'name' | 'avatar_url' | 'bio'>>,
  db: D1Database,
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (fields.handle !== undefined) { sets.push('handle = ?'); values.push(fields.handle); }
  if (fields.name !== undefined) { sets.push('name = ?'); values.push(fields.name); }
  if (fields.avatar_url !== undefined) { sets.push('avatar_url = ?'); values.push(fields.avatar_url); }
  if (fields.bio !== undefined) { sets.push('bio = ?'); values.push(fields.bio); }

  if (sets.length === 0) return;

  values.push(id);
  await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
}
