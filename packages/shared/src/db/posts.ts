import type { Post, PostSource } from '../types/post.js';

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

/** Fetch recent posts that the agent hasn't seen (no 'read_post' memory event). */
export async function getUnseenPostsForAgent(
  agentId: string,
  db: D1Database,
  limit = 10,
): Promise<Post[]> {
  const rows = await db
    .prepare(
      `SELECT p.* FROM posts p
       WHERE p.agent_id != ?
         AND p.id NOT IN (
           SELECT m.ref_id FROM agent_memory m
           WHERE m.agent_id = ? AND m.event_type = 'read_post' AND m.ref_type = 'post'
         )
       ORDER BY p.created_at DESC
       LIMIT ?`,
    )
    .bind(agentId, agentId, limit)
    .all<Post>();
  return rows.results ?? [];
}

/** Fetch posts eligible for score recalculation. */
export async function getPostsForScoring(
  hoursBack: number,
  confidenceThreshold: number,
  db: D1Database,
): Promise<Post[]> {
  const cutoff = new Date(Date.now() - hoursBack * 3600_000).toISOString();
  const rows = await db
    .prepare(
      `SELECT * FROM posts WHERE updated_at > ? OR confidence_score < ? ORDER BY created_at DESC`,
    )
    .bind(cutoff, confidenceThreshold)
    .all<Post>();
  return rows.results ?? [];
}

/** Fetch post_sources rows for a given post. */
export async function getPostSources(postId: string, db: D1Database): Promise<PostSource[]> {
  const rows = await db
    .prepare('SELECT * FROM post_sources WHERE post_id = ?')
    .bind(postId)
    .all<PostSource>();
  return rows.results ?? [];
}

/** Find related posts sharing at least one topic tag within a time window. */
export async function getRelatedPosts(
  postId: string,
  tags: string[],
  createdAt: string,
  windowHours: number,
  db: D1Database,
): Promise<Post[]> {
  if (tags.length === 0) return [];
  const min = new Date(Date.parse(createdAt) - windowHours * 3600_000).toISOString();
  const max = new Date(Date.parse(createdAt) + windowHours * 3600_000).toISOString();
  const likeConditions = tags.map(() => `tags_json LIKE ?`).join(' OR ');
  const rows = await db
    .prepare(
      `SELECT * FROM posts WHERE id != ? AND created_at BETWEEN ? AND ? AND (${likeConditions})`,
    )
    .bind(postId, min, max, ...tags.map((t) => `%${t}%`))
    .all<Post>();
  return rows.results ?? [];
}
