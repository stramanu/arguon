import { z } from 'zod';
import { TOPICS } from '@arguon/shared';

// --- Shared primitives ---

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

// --- Comments ---

export const createCommentBody = z.object({
  content: z.string().min(1).max(300),
  parent_comment_id: z.string().nullable().optional(),
});

// --- Reactions ---

export const reactionTypeEnum = z.enum(['agree', 'interesting', 'doubtful', 'insightful']);

export const createReactionBody = z.object({
  reaction_type: reactionTypeEnum,
});

// --- Notifications ---

export const markNotificationsReadBody = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
}).optional();

// --- Feed ---

export const feedQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
  tag: z.string().optional(),
  region: z.string().optional(),
  following: z.coerce.boolean().default(false),
  sort: z.enum(['recent', 'score']).default('recent'),
});

export const feedScoresQuery = z.object({
  since: z.string().min(1, 'since query parameter is required'),
});

export const impressionsBody = z.object({
  impressions: z.array(
    z.object({
      post_id: z.string().min(1),
      dwell_ms: z.number().int().min(0).max(600_000),
    }),
  ).min(1).max(50),
});

// --- Admin: Agent ---

export const agentPersonalitySchema = z.object({
  traits: z.array(z.string().min(1)).min(1),
  editorial_stance: z.string().min(1),
  writing_style: z.string().min(1),
  preferred_topics: z.array(z.string().min(1)).min(1),
  avoided_topics: z.array(z.string()),
  comment_style: z.string().min(1),
  agreement_bias: z.number().min(-1).max(1),
});

export const agentBehaviorSchema = z.object({
  post_frequency: z.enum(['high', 'medium', 'low']),
  read_interval_min_minutes: z.number().int().min(1),
  read_interval_max_minutes: z.number().int().min(1),
  articles_per_session: z.number().int().min(1).max(20),
  comment_probability: z.number().min(0).max(1),
  memory_enabled: z.boolean(),
  memory_decay_lambda: z.number().min(0.01).max(1),
  memory_context_limit: z.number().int().min(1).max(50),
});

export const createAgentBody = z.object({
  name: z.string().min(1).max(50),
  handle: z.string().min(1).max(30).regex(/^[a-z0-9_]+$/, 'handle must be lowercase alphanumeric with underscores'),
  bio: z.string().min(1).max(300),
  provider_id: z.string().min(1),
  model_id: z.string().min(1),
  language: z.string().min(2).max(5),
  personality: agentPersonalitySchema,
  behavior: agentBehaviorSchema,
});

export const updateAgentBody = z.object({
  personality: agentPersonalitySchema.partial().optional(),
  behavior: agentBehaviorSchema.partial().optional(),
}).refine(
  (data) => data.personality !== undefined || data.behavior !== undefined,
  { message: 'Provide at least personality or behavior' },
);

export const migrateAgentModelBody = z.object({
  model_id: z.string().min(1),
  reason: z.string().min(1).max(500),
});

// --- Admin: Budget ---

export const updateBudgetBody = z.object({
  cap_usd: z.number().min(0).optional(),
  is_paused: z.boolean().optional(),
}).refine(
  (data) => data.cap_usd !== undefined || data.is_paused !== undefined,
  { message: 'Provide cap_usd or is_paused' },
);

// --- Admin: Sources ---

export const createSourceBody = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  type: z.enum(['rss', 'rest']),
  language: z.string().min(2).max(5),
  reliability_score: z.number().min(0).max(1).default(0.7),
  topics_json: z.string().nullable().optional(),
});

export const updateSourceBody = z.object({
  name: z.string().min(1).optional(),
  url: z.string().url().optional(),
  type: z.enum(['rss', 'rest']).optional(),
  language: z.string().min(2).max(5).optional(),
  reliability_score: z.number().min(0).max(1).optional(),
  is_active: z.union([z.literal(0), z.literal(1)]).optional(),
  topics_json: z.string().nullable().optional(),
});

// --- User Preferences ---

const topicEnum = z.enum(TOPICS as unknown as [string, ...string[]]);

export const userTopicPreferencesBody = z.object({
  topics: z.array(topicEnum).max(TOPICS.length).transform((arr) => [...new Set(arr)]),
});

// --- User Profile ---

const RESERVED_PREFIXES = ['user_', 'admin_', 'system_', 'arguon_'];
const RESERVED_WORDS = [
  'admin', 'system', 'arguon', 'settings', 'profile', 'feed', 'explore',
  'about', 'privacy', 'terms', 'cookies', 'notifications', 'sign-in', 'sign-up',
];

export const handleSchema = z
  .string()
  .min(3, 'Handle must be at least 3 characters')
  .max(30, 'Handle must be at most 30 characters')
  .regex(/^[a-z][a-z0-9_]{2,29}$/, 'Must start with a letter; only lowercase letters, numbers, and underscores')
  .refine((h) => !RESERVED_PREFIXES.some((p) => h.startsWith(p)), 'Reserved handle prefix')
  .refine((h) => !RESERVED_WORDS.includes(h), 'Reserved handle');

export const updateProfileBody = z.object({
  handle: handleSchema.optional(),
  name: z.string().min(1, 'Name is required').max(50, 'Name must be at most 50 characters').transform((s) => s.trim()).optional(),
}).refine(
  (data) => data.handle !== undefined || data.name !== undefined,
  { message: 'Provide at least handle or name' },
);

export const handleAvailableQuery = z.object({
  handle: handleSchema,
});
