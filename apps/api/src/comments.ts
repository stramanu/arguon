import type { Hono } from 'hono';
import type { Bindings } from './index.js';
import { withAuth } from './auth.js';
import {
  getPostById,
  insertComment,
  insertModerationLog,
  createLLMProvider,
  getCommentById,
  createNotification,
  getUserByHandle,
  stripHtml,
} from '@arguon/shared';
import type { Comment, Notification } from '@arguon/shared';

function parseModerationResult(text: string): { decision: 'approved' | 'rejected'; reason: string } {
  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned) as { decision: string; reason: string };
    if (parsed.decision === 'approved' || parsed.decision === 'rejected') {
      return { decision: parsed.decision, reason: parsed.reason ?? '' };
    }
  } catch { /* fall through */ }
  return { decision: 'approved', reason: 'Failed to parse moderation response — defaulting to approved' };
}

function parseModeratorModel(model: string): { provider: string; modelId: string } {
  const [provider, ...rest] = model.split(':');
  return { provider, modelId: rest.join(':') };
}

function getLLMKeys(env: Bindings): Record<string, string> {
  return {
    anthropic: env.ANTHROPIC_API_KEY ?? '',
    gemini: env.GEMINI_API_KEY ?? '',
    groq: env.GROQ_API_KEY ?? '',
  };
}

export function registerCommentRoutes(app: Hono<{ Bindings: Bindings }>) {
  app.post('/posts/:id/comments', withAuth, async (c) => {
    const postId = c.req.param('id');
    const body = await c.req.json().catch(() => null);

    if (!body || typeof body.content !== 'string') {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'content is required and must be a string' } },
        400,
      );
    }

    const content = stripHtml(body.content.trim());
    if (content.length === 0 || content.length > 300) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'content must be between 1 and 300 characters' } },
        400,
      );
    }

    const parentCommentId: string | null = typeof body.parent_comment_id === 'string' ? body.parent_comment_id : null;

    const post = await getPostById(postId, c.env.DB);
    if (!post) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Post not found' } }, 404);
    }

    // Moderation check
    const commentId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { provider, modelId } = parseModeratorModel(c.env.MODERATOR_MODEL);
    const keys = getLLMKeys(c.env);
    const llm = createLLMProvider(provider, modelId, keys);

    const moderationResult = await llm.call({
      system: `You are a content moderator for a social platform. Evaluate the following user comment for:
- Hate speech or discrimination
- Threats or incitement to violence
- Spam or advertising
- Personal information exposure (doxxing)
- Extreme profanity or abuse

Return JSON only, no preamble:
{ "decision": "approved" | "rejected", "reason": "brief explanation" }`,
      user: content,
      maxTokens: 100,
    });

    const moderation = parseModerationResult(moderationResult.text);

    await insertModerationLog(
      {
        id: crypto.randomUUID(),
        target_type: 'comment',
        target_id: commentId,
        decision: moderation.decision,
        reason: moderation.reason,
        checked_at: now,
      },
      c.env.DB,
    );

    if (moderation.decision === 'rejected') {
      return c.json(
        { error: { code: 'MODERATION_REJECTED', message: moderation.reason } },
        422,
      );
    }

    const user = c.get('user');
    const comment: Comment = {
      id: commentId,
      post_id: postId,
      parent_comment_id: parentCommentId,
      user_id: user.id,
      content,
      is_ai: 0,
      created_at: now,
    };

    await insertComment(comment, c.env.DB);

    // Create notifications (best-effort, don't block response)
    try {
      const notifNow = new Date().toISOString();

      // Reply notification: notify parent comment author
      if (parentCommentId) {
        const parentComment = await getCommentById(parentCommentId, c.env.DB);
        if (parentComment && parentComment.user_id !== user.id) {
          const notif: Notification = {
            id: crypto.randomUUID(),
            user_id: parentComment.user_id,
            type: 'reply',
            actor_id: user.id,
            post_id: postId,
            comment_id: commentId,
            is_read: 0,
            created_at: notifNow,
          };
          await createNotification(notif, c.env.DB);
        }
      }

      // Mention notifications: parse @handle from content
      const mentionPattern = /@([a-zA-Z0-9_]+)/g;
      let match: RegExpExecArray | null;
      const mentionedHandles = new Set<string>();
      while ((match = mentionPattern.exec(content)) !== null) {
        mentionedHandles.add(match[1].toLowerCase());
      }
      for (const handle of mentionedHandles) {
        const mentionedUser = await getUserByHandle(handle, c.env.DB);
        if (mentionedUser && mentionedUser.id !== user.id) {
          const notif: Notification = {
            id: crypto.randomUUID(),
            user_id: mentionedUser.id,
            type: 'mention',
            actor_id: user.id,
            post_id: postId,
            comment_id: commentId,
            is_read: 0,
            created_at: notifNow,
          };
          await createNotification(notif, c.env.DB);
        }
      }
    } catch (err) {
      console.error('[comments] Notification creation failed:', err);
    }

    return c.json({ data: comment }, 201);
  });
}
