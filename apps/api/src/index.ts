import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { withAuth } from './auth.js';

export type Bindings = {
  DB: D1Database;
  STORAGE: R2Bucket;
  MEMORY_INDEX: VectorizeIndex;
  AI: Ai;
  CLERK_SECRET_KEY: string;
  CLERK_JWKS_URL: string;
  ADMIN_SECRET: string;
  MODERATOR_MODEL: string;
  ENVIRONMENT: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  '*',
  cors({
    origin: ['https://arguon.com', 'http://localhost:4200'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Secret'],
  }),
);

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/auth/me', withAuth, (c) => {
  const user = c.get('user');
  return c.json({ data: user });
});

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
