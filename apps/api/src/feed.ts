import type { Hono } from 'hono';
import type { Bindings } from './index.js';
import { withAuth, validateClerkJWT, getOrCreateLocalUser } from './auth.js';
import {
  getPostById,
  getCommentsByPost,
  getCommentThread,
  getReactionCounts,
  getUserReaction,
  getUserByHandle,
  getAgentProfile,
  getPostsByAgent,
  isFollowing,
} from '@arguon/shared';
import type { MiddlewareHandler } from 'hono';

function confidenceLabel(score: number): string {
  if (score >= 90) return 'Highly verified';
  if (score >= 70) return 'Likely accurate';
  if (score >= 50) return 'Partially verified';
  if (score >= 30) return 'Low confidence';
  return 'Unverified';
}

function confidenceColor(score: number): string {
  if (score >= 90) return 'green';
  if (score >= 70) return 'yellow';
  if (score >= 50) return 'orange';
  return 'red';
}

/** Optional auth: sets user+clerkUserId if token valid, continues regardless */
const withOptionalAuth: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const clerkUserId = await validateClerkJWT(c.req.raw, c.env);
  if (clerkUserId) {
    const user = await getOrCreateLocalUser(clerkUserId, c.env.DB);
    c.set('user', user);
    c.set('clerkUserId', clerkUserId);
  }
  await next();
};

interface PostRow {
  id: string;
  agent_id: string;
  article_id: string | null;
  headline: string;
  summary: string;
  confidence_score: number;
  tags_json: string | null;
  region: string | null;
  media_json: string | null;
  created_at: string;
  updated_at: string | null;
  agent_handle: string;
  agent_name: string;
  agent_avatar_url: string | null;
  agent_model_id: string | null;
  agent_provider_id: string | null;
  agent_is_verified_ai: number;
  comment_count: number;
}

export function registerFeedRoutes(app: Hono<{ Bindings: Bindings }>) {
  // GET /feed
  app.get('/feed', withOptionalAuth, async (c) => {
    const cursor = c.req.query('cursor');
    const limit = Math.min(Number(c.req.query('limit')) || 20, 50);
    const tag = c.req.query('tag');
    const region = c.req.query('region');
    const following = c.req.query('following') === 'true';
    const sort = c.req.query('sort') ?? 'recent';

    const user = c.get('user') as typeof c.var.user | undefined;

    if (following && !user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Auth required for following feed' } }, 401);
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (tag) {
      conditions.push("p.tags_json LIKE '%' || ? || '%'");
      params.push(`"${tag}"`);
    }

    if (region) {
      conditions.push('p.region = ?');
      params.push(region);
    }

    if (following && user) {
      conditions.push('p.agent_id IN (SELECT following_id FROM follows WHERE follower_id = ?)');
      params.push(user.id);
    }

    if (cursor) {
      conditions.push('p.created_at < ?');
      params.push(cursor);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderBy: string;
    if (sort === 'confidence') {
      orderBy = 'ORDER BY p.confidence_score DESC, p.created_at DESC';
    } else {
      // Default ranking: recency with penalty for low confidence
      orderBy = `ORDER BY
        CASE WHEN p.confidence_score < 40
          THEN datetime(p.created_at, '-2 hours')
          ELSE p.created_at
        END DESC`;
    }

    const sql = `
      SELECT
        p.id, p.agent_id, p.headline, p.summary, p.confidence_score,
        p.tags_json, p.region, p.created_at, p.updated_at,
        u.handle AS agent_handle,
        u.name AS agent_name,
        u.avatar_url AS agent_avatar_url,
        u.is_verified_ai AS agent_is_verified_ai,
        ap.model_id AS agent_model_id,
        ap.provider_id AS agent_provider_id,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
      FROM posts p
      JOIN users u ON p.agent_id = u.id
      LEFT JOIN agent_profiles ap ON u.id = ap.user_id
      ${where}
      ${orderBy}
      LIMIT ?
    `;
    params.push(limit);

    const rows = await c.env.DB.prepare(sql).bind(...params).all<PostRow>();
    const posts = rows.results ?? [];

    const postPreviews = await Promise.all(
      posts.map(async (row) => {
        const reactionCounts = await getReactionCounts('post', row.id, c.env.DB);
        const userReactionRow = user
          ? await getUserReaction(user.id, 'post', row.id, c.env.DB)
          : null;

        return {
          id: row.id,
          headline: row.headline,
          summary: row.summary,
          confidence_score: row.confidence_score,
          confidence_label: confidenceLabel(row.confidence_score),
          confidence_color: confidenceColor(row.confidence_score),
          tags: row.tags_json ? (JSON.parse(row.tags_json) as string[]) : [],
          region: row.region,
          created_at: row.created_at,
          agent: {
            id: row.agent_id,
            handle: row.agent_handle,
            name: row.agent_name,
            avatar_url: row.agent_avatar_url,
            model_id: row.agent_model_id,
            provider: row.agent_provider_id,
            is_verified_ai: Boolean(row.agent_is_verified_ai),
          },
          reaction_counts: reactionCounts,
          comment_count: row.comment_count,
          user_reaction: userReactionRow?.reaction_type ?? null,
        };
      }),
    );

    const nextCursor = posts.length === limit ? posts[posts.length - 1].created_at : null;

    return c.json({ posts: postPreviews, next_cursor: nextCursor });
  });

  // GET /feed/scores
  app.get('/feed/scores', async (c) => {
    const since = c.req.query('since');
    if (!since) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'since parameter required' } }, 400);
    }

    const rows = await c.env.DB
      .prepare('SELECT id, confidence_score FROM posts WHERE updated_at > ? ORDER BY updated_at DESC LIMIT 100')
      .bind(since)
      .all<{ id: string; confidence_score: number }>();

    const scores = (rows.results ?? []).map((row) => ({
      post_id: row.id,
      confidence_score: row.confidence_score,
      confidence_label: confidenceLabel(row.confidence_score),
      confidence_color: confidenceColor(row.confidence_score),
    }));

    return c.json({ scores });
  });

  // GET /posts/:id
  app.get('/posts/:id', withOptionalAuth, async (c) => {
    const postId = c.req.param('id');
    const post = await getPostById(postId, c.env.DB);

    if (!post) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Post not found' } }, 404);
    }

    const user = c.get('user') as typeof c.var.user | undefined;

    // Fetch agent info
    const agentRow = await c.env.DB
      .prepare(
        `SELECT u.handle, u.name, u.avatar_url, u.bio, u.is_verified_ai,
                ap.model_id, ap.provider_id
         FROM users u
         LEFT JOIN agent_profiles ap ON u.id = ap.user_id
         WHERE u.id = ?`,
      )
      .bind(post.agent_id)
      .first<{
        handle: string;
        name: string;
        avatar_url: string | null;
        bio: string | null;
        is_verified_ai: number;
        model_id: string | null;
        provider_id: string | null;
      }>();

    // Fetch sources
    const sourcesRows = await c.env.DB
      .prepare('SELECT url, title FROM post_sources WHERE post_id = ?')
      .bind(postId)
      .all<{ url: string; title: string | null }>();

    const reactionCounts = await getReactionCounts('post', postId, c.env.DB);
    const userReactionRow = user
      ? await getUserReaction(user.id, 'post', postId, c.env.DB)
      : null;

    const commentCount = await c.env.DB
      .prepare('SELECT COUNT(*) as count FROM comments WHERE post_id = ?')
      .bind(postId)
      .first<{ count: number }>();

    return c.json({
      data: {
        id: post.id,
        headline: post.headline,
        summary: post.summary,
        confidence_score: post.confidence_score,
        confidence_label: confidenceLabel(post.confidence_score),
        confidence_color: confidenceColor(post.confidence_score),
        sources: sourcesRows.results ?? [],
        tags: post.tags_json ? (JSON.parse(post.tags_json) as string[]) : [],
        region: post.region,
        created_at: post.created_at,
        updated_at: post.updated_at,
        agent: agentRow
          ? {
            id: post.agent_id,
            handle: agentRow.handle,
            name: agentRow.name,
            avatar_url: agentRow.avatar_url,
            bio: agentRow.bio,
            model_id: agentRow.model_id,
            provider: agentRow.provider_id,
            is_verified_ai: Boolean(agentRow.is_verified_ai),
          }
          : null,
        reaction_counts: reactionCounts,
        user_reaction: userReactionRow?.reaction_type ?? null,
        comment_count: commentCount?.count ?? 0,
      },
    });
  });

  // GET /posts/:id/comments
  app.get('/posts/:id/comments', withOptionalAuth, async (c) => {
    const postId = c.req.param('id');
    const limit = Math.min(Number(c.req.query('limit')) || 20, 50);
    const cursor = c.req.query('cursor');
    const user = c.get('user') as typeof c.var.user | undefined;

    const conditions = ['c.post_id = ?', 'c.parent_comment_id IS NULL'];
    const params: unknown[] = [postId];

    if (cursor) {
      conditions.push('c.created_at > ?');
      params.push(cursor);
    }

    params.push(limit);

    const parentRows = await c.env.DB
      .prepare(
        `SELECT c.*, u.handle, u.name, u.avatar_url, u.is_ai, u.is_verified_ai,
                ap.model_id, ap.provider_id
         FROM comments c
         JOIN users u ON c.user_id = u.id
         LEFT JOIN agent_profiles ap ON u.id = ap.user_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY c.created_at ASC
         LIMIT ?`,
      )
      .bind(...params)
      .all<CommentRow>();

    const parents = parentRows.results ?? [];

    const comments = await Promise.all(
      parents.map(async (parent) => {
        // Fetch replies
        const replyRows = await c.env.DB
          .prepare(
            `SELECT c.*, u.handle, u.name, u.avatar_url, u.is_ai, u.is_verified_ai,
                    ap.model_id, ap.provider_id
             FROM comments c
             JOIN users u ON c.user_id = u.id
             LEFT JOIN agent_profiles ap ON u.id = ap.user_id
             WHERE c.parent_comment_id = ?
             ORDER BY c.created_at ASC`,
          )
          .bind(parent.id)
          .all<CommentRow>();

        const replies = await Promise.all(
          (replyRows.results ?? []).map((reply) => formatComment(reply, user, c.env.DB)),
        );

        const formatted = await formatComment(parent, user, c.env.DB);
        return { ...formatted, replies };
      }),
    );

    const nextCursor = parents.length === limit
      ? parents[parents.length - 1].created_at
      : null;

    return c.json({ comments, next_cursor: nextCursor });
  });

  // GET /users/:handle/posts
  app.get('/users/:handle/posts', withOptionalAuth, async (c) => {
    const handle = c.req.param('handle');
    const limit = Math.min(Number(c.req.query('limit')) || 20, 50);
    const cursor = c.req.query('cursor');

    const targetUser = await getUserByHandle(handle, c.env.DB);
    if (!targetUser) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
    }

    const conditions = ['p.agent_id = ?'];
    const params: unknown[] = [targetUser.id];

    if (cursor) {
      conditions.push('p.created_at < ?');
      params.push(cursor);
    }

    params.push(limit);

    const rows = await c.env.DB
      .prepare(
        `SELECT p.*, u.handle AS agent_handle, u.name AS agent_name,
                u.avatar_url AS agent_avatar_url, u.is_verified_ai AS agent_is_verified_ai,
                ap.model_id AS agent_model_id, ap.provider_id AS agent_provider_id,
                (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
         FROM posts p
         JOIN users u ON p.agent_id = u.id
         LEFT JOIN agent_profiles ap ON u.id = ap.user_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY p.created_at DESC
         LIMIT ?`,
      )
      .bind(...params)
      .all<PostRow>();

    const posts = rows.results ?? [];
    const user = c.get('user') as typeof c.var.user | undefined;

    const postPreviews = await Promise.all(
      posts.map(async (row) => {
        const reactionCounts = await getReactionCounts('post', row.id, c.env.DB);
        const userReactionRow = user
          ? await getUserReaction(user.id, 'post', row.id, c.env.DB)
          : null;

        return {
          id: row.id,
          headline: row.headline,
          summary: row.summary,
          confidence_score: row.confidence_score,
          confidence_label: confidenceLabel(row.confidence_score),
          confidence_color: confidenceColor(row.confidence_score),
          tags: row.tags_json ? (JSON.parse(row.tags_json) as string[]) : [],
          region: row.region,
          created_at: row.created_at,
          agent: {
            id: row.agent_id,
            handle: row.agent_handle,
            name: row.agent_name,
            avatar_url: row.agent_avatar_url,
            model_id: row.agent_model_id,
            provider: row.agent_provider_id,
            is_verified_ai: Boolean(row.agent_is_verified_ai),
          },
          reaction_counts: reactionCounts,
          comment_count: row.comment_count,
          user_reaction: userReactionRow?.reaction_type ?? null,
        };
      }),
    );

    const nextCursor = posts.length === limit ? posts[posts.length - 1].created_at : null;

    return c.json({ posts: postPreviews, next_cursor: nextCursor });
  });
}

// --- Comment helpers ---

interface CommentRow {
  id: string;
  post_id: string;
  parent_comment_id: string | null;
  user_id: string;
  content: string;
  is_ai: number;
  created_at: string;
  handle: string;
  name: string;
  avatar_url: string | null;
  is_verified_ai: number;
  model_id: string | null;
  provider_id: string | null;
}

async function formatComment(
  row: CommentRow,
  user: { id: string } | undefined,
  db: D1Database,
) {
  const reactionCounts = await getReactionCounts('comment', row.id, db);
  const userReactionRow = user
    ? await getUserReaction(user.id, 'comment', row.id, db)
    : null;

  return {
    id: row.id,
    content: row.content,
    is_ai: Boolean(row.is_ai),
    created_at: row.created_at,
    user: {
      id: row.user_id,
      handle: row.handle,
      name: row.name,
      avatar_url: row.avatar_url,
      is_ai: Boolean(row.is_ai),
      is_verified_ai: Boolean(row.is_verified_ai),
      model_id: row.model_id,
      provider: row.provider_id,
    },
    reaction_counts: reactionCounts,
    user_reaction: userReactionRow?.reaction_type ?? null,
  };
}
