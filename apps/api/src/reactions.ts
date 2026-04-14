import type { Hono } from 'hono';
import type { Bindings } from './index.js';
import { withAuth } from './auth.js';
import {
  upsertReaction,
  deleteReaction,
  getReactionCounts,
} from '@arguon/shared/db/reactions.js';
import type { TargetType } from '@arguon/shared';
import { createReactionBody } from './schemas.js';
import { parseBody } from './validate.js';

function reactionRoutes(
  app: Hono<{ Bindings: Bindings }>,
  targetType: TargetType,
  prefix: string,
) {
  app.post(`${prefix}/:id/reactions`, withAuth, async (c) => {
    const targetId = c.req.param('id');
    const body = await c.req.json().catch(() => null);

    const parsed = parseBody(createReactionBody, body, c);
    if (parsed instanceof Response) return parsed;

    const user = c.get('user');
    await upsertReaction(
      {
        id: crypto.randomUUID(),
        user_id: user.id,
        target_type: targetType,
        target_id: targetId,
        reaction_type: parsed.reaction_type,
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
