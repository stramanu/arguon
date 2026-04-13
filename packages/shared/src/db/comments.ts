import type { Comment } from '../types/comment.js';

export async function getCommentsByPost(
  postId: string,
  db: D1Database,
): Promise<Comment[]> {
  const rows = await db
    .prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC')
    .bind(postId)
    .all<Comment>();
  return rows.results ?? [];
}

export async function insertComment(comment: Comment, db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO comments (id, post_id, parent_comment_id, user_id, content, is_ai, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      comment.id,
      comment.post_id,
      comment.parent_comment_id,
      comment.user_id,
      comment.content,
      comment.is_ai,
      comment.created_at,
    )
    .run();
}

export async function getCommentThread(
  parentCommentId: string,
  db: D1Database,
): Promise<Comment[]> {
  const rows = await db
    .prepare('SELECT * FROM comments WHERE parent_comment_id = ? ORDER BY created_at ASC')
    .bind(parentCommentId)
    .all<Comment>();
  return rows.results ?? [];
}
