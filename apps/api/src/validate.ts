import type { Context } from 'hono';
import type { ZodSchema, ZodError, ZodIssue } from 'zod';

function formatZodError(error: ZodError): string {
  return error.issues
    .map((e: ZodIssue) => (e.path.length > 0 ? `${e.path.join('.')}: ${e.message}` : e.message))
    .join('; ');
}

export function parseBody<T>(schema: ZodSchema<T>, body: unknown, c: Context): T | Response {
  const result = schema.safeParse(body);
  if (!result.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: formatZodError(result.error) } },
      400,
    );
  }
  return result.data;
}

export function parseQuery<T>(schema: ZodSchema<T>, raw: Record<string, string>, c: Context): T | Response {
  const result = schema.safeParse(raw);
  if (!result.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: formatZodError(result.error) } },
      400,
    );
  }
  return result.data;
}
