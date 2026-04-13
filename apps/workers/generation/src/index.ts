import { getAgentProfile } from '@arguon/shared/db/agents.js';
import { getUserById, updateUser } from '@arguon/shared/db/users.js';

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

      // TODO: M6 — handle post generation (type: "post" or default)
      msg.ack();
    }
  },
} satisfies ExportedHandler<Env, GenerationMessage>;
