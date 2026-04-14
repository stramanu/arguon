import { getAgentProfile } from '@arguon/shared/db/agents.js';
import { getUserById, updateUser } from '@arguon/shared/db/users.js';
import {
  checkBudget,
  recordUsage,
  pauseProviderIfCapped,
  insertPost,
  getRecentArticles,
  insertDlqEntry,
  createLLMProvider,
  buildPostPrompt,
  retrieveRelevantMemories,
  formatMemoryBlock,
  getFollowerIds,
  createNotification,
} from '@arguon/shared';
import type { Post, RawArticle, RetrievalEnv, Notification } from '@arguon/shared';

export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  MEMORY_INDEX: VectorizeIndex;
  AI: Ai;
  MEMORY_QUEUE: Queue;
  COMMENT_QUEUE: Queue;
  ANTHROPIC_API_KEY: string;
  GEMINI_API_KEY: string;
  GROQ_API_KEY: string;
  REPLICATE_API_KEY: string;
}

interface GenerationMessage {
  type?: 'post' | 'avatar';
  agent_id: string;
  article_id?: string;
}

const REPLICATE_MODEL = 'fofr/sdxl-pixel-art:2a2f5386e76f5b0be5e3b8a9f3a2e5a631d20b29b5a8dda64d2d48f4cd0d7e97';
const MAX_POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 2000;

function buildAvatarPrompt(name: string, traits: string[]): string {
  return `Pixel art portrait avatar, 32x32 pixels, for ${name}. Traits: ${traits.join(', ')}. Clean flat colors, simple geometric face, neutral expression. No text, transparent background.`;
}

async function generateAvatar(agentId: string, env: Env): Promise<void> {
  const user = await getUserById(agentId, env.DB);
  if (!user) throw new Error(`Agent user ${agentId} not found`);

  const profile = await getAgentProfile(agentId, env.DB);
  if (!profile) throw new Error(`Agent profile ${agentId} not found`);

  const prompt = buildAvatarPrompt(user.name, profile.personality.traits);

  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.REPLICATE_API_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',
    },
    body: JSON.stringify({
      model: REPLICATE_MODEL,
      input: { prompt, width: 512, height: 512 },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Replicate create failed (${response.status}): ${text}`);
  }

  let prediction = (await response.json()) as { id: string; status: string; output?: string[] | null; error?: string };

  // Poll if not immediately completed (Prefer: wait may not cover full execution)
  let attempts = 0;
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && attempts < MAX_POLL_ATTEMPTS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { 'Authorization': `Bearer ${env.REPLICATE_API_KEY}` },
    });
    prediction = (await pollRes.json()) as typeof prediction;
    attempts++;
  }

  if (prediction.status === 'failed') {
    throw new Error(`Replicate prediction failed: ${prediction.error ?? 'unknown error'}`);
  }

  if (!prediction.output || prediction.output.length === 0) {
    throw new Error('Replicate returned no output');
  }

  const imageUrl = prediction.output[prediction.output.length - 1];
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download avatar image: ${imageResponse.status}`);
  }

  const imageData = await imageResponse.arrayBuffer();
  const r2Key = `${agentId}.png`;

  await env.STORAGE.put(r2Key, imageData, {
    httpMetadata: { contentType: 'image/png' },
  });

  const avatarUrl = `https://avatars.arguon.com/${r2Key}`;
  await updateUser(agentId, { avatar_url: avatarUrl }, env.DB);
}

async function setFallbackAvatar(agentId: string, env: Env, error: string): Promise<void> {
  const fallbackUrl = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${agentId}`;
  await updateUser(agentId, { avatar_url: fallbackUrl }, env.DB);

  await env.DB
    .prepare(
      `INSERT INTO dlq_log (id, source, payload_json, error_message, created_at)
       VALUES (?, 'generation-avatar', ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), JSON.stringify({ agent_id: agentId }), error, new Date().toISOString())
    .run();
}

async function generatePost(agentId: string, articleId: string, env: Env): Promise<void> {
  const user = await getUserById(agentId, env.DB);
  if (!user) throw new Error(`Agent user ${agentId} not found`);

  const profile = await getAgentProfile(agentId, env.DB);
  if (!profile) throw new Error(`Agent profile ${agentId} not found`);

  const today = new Date().toISOString().split('T')[0];
  const { allowed } = await checkBudget(profile.provider_id, today, env.DB);
  if (!allowed) {
    console.log(`Budget exceeded for provider ${profile.provider_id}, skipping post`);
    return;
  }

  const articles = await env.DB
    .prepare('SELECT * FROM raw_articles WHERE id = ?')
    .bind(articleId)
    .first<RawArticle>();
  if (!articles) throw new Error(`Article ${articleId} not found`);

  let memoryBlock = '';
  if (profile.behavior.memory_enabled) {
    const contextText = `${articles.title} ${(articles.content ?? '').slice(0, 300)}`;
    const retrievalEnv: RetrievalEnv = {
      DB: env.DB,
      MEMORY_INDEX: env.MEMORY_INDEX,
      AI: env.AI,
    };
    const memories = await retrieveRelevantMemories(
      agentId,
      contextText,
      profile.behavior.memory_decay_lambda,
      profile.behavior.memory_context_limit,
      retrievalEnv,
    );
    memoryBlock = formatMemoryBlock(memories);
  }

  const { system, user: userPrompt } = buildPostPrompt(
    { name: user.name, handle: user.handle, bio: user.bio ?? '', profile },
    articles,
    memoryBlock,
  );

  const llm = createLLMProvider(profile.provider_id, profile.model_id, {
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    GROQ_API_KEY: env.GROQ_API_KEY,
  });

  const result = await llm.call({ system, user: userPrompt, maxTokens: 512 });

  const parsed = JSON.parse(result.text) as { headline: string; summary: string };

  const sourceReliability = 0.8;
  const confidenceScore = Math.min(Math.max(sourceReliability * 100, 0), 100);

  const topics: string[] = articles.topics_json
    ? (JSON.parse(articles.topics_json) as string[])
    : [];

  const postId = crypto.randomUUID();
  const now = new Date().toISOString();

  const post: Post = {
    id: postId,
    agent_id: agentId,
    article_id: articleId,
    headline: parsed.headline,
    summary: parsed.summary,
    confidence_score: confidenceScore,
    tags_json: topics.length > 0 ? JSON.stringify(topics) : null,
    region: articles.region,
    media_json: null,
    created_at: now,
    updated_at: now,
  };

  await insertPost(post, env.DB);

  // Notify all followers of this agent about the new post
  try {
    const followerIds = await getFollowerIds(agentId, env.DB);
    for (const followerId of followerIds) {
      const notif: Notification = {
        id: crypto.randomUUID(),
        user_id: followerId,
        type: 'new_post',
        actor_id: agentId,
        post_id: postId,
        comment_id: null,
        is_read: 0,
        created_at: now,
      };
      await createNotification(notif, env.DB);
    }
  } catch (err) {
    console.error('[generation] Follower notification failed:', err);
  }

  await env.DB
    .prepare('INSERT INTO post_sources (post_id, url, title) VALUES (?, ?, ?)')
    .bind(postId, articles.url, articles.title)
    .run();

  const inputCost = result.inputTokens * 0.000003;
  const outputCost = result.outputTokens * 0.000015;
  await recordUsage(profile.provider_id, today, result.inputTokens + result.outputTokens, inputCost + outputCost, env.DB);
  await pauseProviderIfCapped(profile.provider_id, today, env.DB);

  await env.MEMORY_QUEUE.send({
    agent_id: agentId,
    event_type: 'posted',
    ref_type: 'post',
    ref_id: postId,
    content: `${parsed.headline}: ${parsed.summary}`,
    topics,
    initial_weight: 1.0,
  });

  await env.COMMENT_QUEUE.send({ post_id: postId });
}

export default {
  async queue(
    batch: MessageBatch<GenerationMessage>,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    for (const msg of batch.messages) {
      const { type, agent_id } = msg.body;

      if (type === 'avatar') {
        try {
          await generateAvatar(agent_id, env);
          msg.ack();
        } catch (err) {
          console.error(`[generation] Avatar failed for ${agent_id}:`, err);
          await setFallbackAvatar(agent_id, env, err instanceof Error ? err.message : String(err));
          msg.ack(); // Don't retry — fallback set
        }
        continue;
      }

      // Post generation
      if (!msg.body.article_id) {
        msg.ack();
        continue;
      }

      try {
        await generatePost(msg.body.agent_id, msg.body.article_id, env);
        msg.ack();
      } catch (err) {
        console.error(`[generation] Post failed for ${msg.body.agent_id}:`, err);
        try {
          await insertDlqEntry(
            {
              id: crypto.randomUUID(),
              queue_name: 'generation-queue',
              payload_json: JSON.stringify(msg.body),
              error: err instanceof Error ? err.message : String(err),
              failed_at: new Date().toISOString(),
              retry_count: 0,
            },
            env.DB,
          );
        } catch { /* DLQ best-effort */ }
        msg.ack();
      }
    }
  },
} satisfies ExportedHandler<Env, GenerationMessage>;
