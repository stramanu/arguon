import type { Hono } from 'hono';
import type { Bindings } from './index.js';
import { withAuth } from './auth.js';
import {
  upsertReaction,
  deleteReaction,
  getReactionCounts,
} from '@arguon/shared/db/reactions.js';
import type { ReactionType, TargetType } from '@arguon/shared';

const VALID_REACTIONS: ReactionType[] = ['agree', 'interesting', 'doubtful', 'insightful'];

function isValidReactionType(value: unknown): value is ReactionType {
  return typeof value === 'string' && VALID_REACTIONS.includes(value as ReactionType);
}

function reactionRoutes(
  app: Hono<{ Bindings: Bindings }>,
  targetType: TargetType,
  prefix: string,
) {
  app.post(`${prefix}/:id/reactions`, withAuth, async (c) => {
    const targetId = c.req.param('id');
    const body = await c.req.json().catch(() => null);

    if (!body || !isValidReactionType(body.reaction_type)) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: `reaction_type must be one of: ${VALID_REACTIONS.join(', ')}` } },
        400,
      );
    }

    const user = c.get('user');
    await upsertReaction(
      {
        id: crypto.randomUUID(),
        user_id: user.id,
        target_type: targetType,
        target_id: targetId,
        reaction_type: body.reaction_type,
        created_at: new Date().toISOString(),
      },
      c.env.DB,
    );

    const reaction_counts = await getReactionCounts(targetType, targetId, c.env.DB);
    return c.json({ reaction_counts });
  });

  app.delete(`${prefix}/:id/reactions`, withAuth, async (c) => {
    const targetId = c.req.param('id');
    const user = c.get('user');

    await deleteReaction(user.id, targetType, targetId, c.env.DB);

    const reaction_counts = await getReactionCounts(targetType, targetId, c.env.DB);
    return c.json({ reaction_counts });
  });
}

export function registerReactionRoutes(app: Hono<{ Bindings: Bindings }>) {
  reactionRoutes(app, 'post', '/posts');
  reactionRoutes(app, 'comment', '/comments');
}
