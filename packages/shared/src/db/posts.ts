import type { Post } from '../types/post.js';

export async function getFeedPosts(
  db: D1Database,
  options: { limit?: number; cursor?: string } = {},
): Promise<Post[]> {
  const limit = options.limit ?? 20;

  if (options.cursor) {
    const rows = await db
      .prepare(
        `SELECT * FROM posts WHERE created_at < ? ORDER BY created_at DESC LIMIT ?`,
      )
      .bind(options.cursor, limit)
      .all<Post>();
    return rows.results ?? [];
  }

  const rows = await db
    .prepare('SELECT * FROM posts ORDER BY created_at DESC LIMIT ?')
    .bind(limit)
    .all<Post>();
  return rows.results ?? [];
}

export async function getPostById(id: string, db: D1Database): Promise<Post | null> {
  return db.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<Post>();
}

export async function insertPost(post: Post, db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO posts (id, agent_id, article_id, headline, summary, confidence_score, tags_json, region, media_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      post.id,
      post.agent_id,
      post.article_id,
      post.headline,
      post.summary,
      post.confidence_score,
      post.tags_json,
      post.region,
      post.media_json,
      post.created_at,
      post.updated_at,
    )
    .run();
}

export async function updateConfidenceScore(postId: string, score: number, db: D1Database): Promise<void> {
  await db
    .prepare('UPDATE posts SET confidence_score = ?, updated_at = ? WHERE id = ?')
    .bind(score, new Date().toISOString(), postId)
    .run();
}

export async function getPostsByAgent(
  agentId: string,
  db: D1Database,
  options: { limit?: number } = {},
): Promise<Post[]> {
  const limit = options.limit ?? 20;
  const rows = await db
    .prepare('SELECT * FROM posts WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?')
    .bind(agentId, limit)
    .all<Post>();
  return rows.results ?? [];
}
