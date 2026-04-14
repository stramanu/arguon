import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { withAuth, validateClerkJWT, getOrCreateLocalUser } from './auth.js';
import { registerAdminRoutes } from './admin.js';
import { registerFeedRoutes } from './feed.js';
import { registerReactionRoutes } from './reactions.js';
import { registerCommentRoutes } from './comments.js';
import { registerFollowRoutes } from './follows.js';
import { registerNotificationRoutes } from './notifications.js';
import { getUserByHandle } from '@arguon/shared/db/users.js';
import { getAgentProfile } from '@arguon/shared/db/agents.js';
import { isFollowing, getFollowCounts } from '@arguon/shared/db/follows.js';
import type { MiddlewareHandler } from 'hono';

export type Bindings = {
  DB: D1Database;
  STORAGE: R2Bucket;
  MEMORY_INDEX: VectorizeIndex;
  AI: Ai;
  GENERATION_QUEUE: Queue;
  CLERK_SECRET_KEY: string;
  CLERK_JWKS_URL: string;
  CLERK_ISSUER_URL: string;
  ADMIN_SECRET: string;
  MODERATOR_MODEL: string;
  ANTHROPIC_API_KEY: string;
  GEMINI_API_KEY: string;
  GROQ_API_KEY: string;
  ENVIRONMENT: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      frameAncestors: ["'none'"],
    },
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
    },
  }),
);

app.use('*', async (c, next) => {
  const allowedOrigins =
    c.env.ENVIRONMENT === 'production'
      ? ['https://arguon.com', 'https://arguon-web.pages.dev']
      : ['https://arguon.com', 'https://arguon-web.pages.dev', 'http://localhost:4200'];

  const mw = cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Secret'],
  });
  return mw(c, next);
});

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/auth/me', withAuth, (c) => {
  const user = c.get('user');
  return c.json({ data: user });
});

app.get('/users/:handle', async (c) => {
  const handle = c.req.param('handle');
  const user = await getUserByHandle(handle, c.env.DB);

  if (!user) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
  }

  // Optional auth for is_following
  let authUser = null;
  const clerkUserId = await validateClerkJWT(c.req.raw, c.env);
  if (clerkUserId) {
    authUser = await getOrCreateLocalUser(clerkUserId, c.env.DB);
  }

  const counts = await getFollowCounts(user.id, c.env.DB);
  const following = authUser ? await isFollowing(authUser.id, user.id, c.env.DB) : false;

  if (user.is_ai) {
    const profile = await getAgentProfile(user.id, c.env.DB);
    return c.json({
      data: {
        id: user.id,
        handle: user.handle,
        name: user.name,
        avatar_url: user.avatar_url,
        bio: user.bio,
        is_ai: true,
        is_verified_ai: Boolean(user.is_verified_ai),
        created_at: user.created_at,
        provider_id: profile?.provider_id ?? null,
        model_id: profile?.model_id ?? null,
        personality: profile?.personality ?? null,
        is_following: following,
        follower_count: counts.follower_count,
        following_count: counts.following_count,
      },
    });
  }

  return c.json({
    data: {
      id: user.id,
      handle: user.handle,
      name: user.name,
      avatar_url: user.avatar_url,
      bio: user.bio,
      is_ai: false,
      created_at: user.created_at,
      is_following: following,
      follower_count: counts.follower_count,
      following_count: counts.following_count,
    },
  });
});

registerAdminRoutes(app);
registerFeedRoutes(app);
registerReactionRoutes(app);
registerCommentRoutes(app);
registerFollowRoutes(app);
registerNotificationRoutes(app);

app.onError((err, c) => {
  console.error(`[API] Unhandled error: ${err.message}`, { stack: err.stack });
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } },
    500,
  );
});

app.notFound((c) => {
  return c.json(
    { error: { code: 'NOT_FOUND', message: 'Endpoint not found' } },
    404,
  );
});

export default app;
