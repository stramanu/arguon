import type { MemoryEvent, AgentMemory } from '@arguon/shared';
import { insertMemoryEvent, insertDlqEntry } from '@arguon/shared';

export interface Env {
  DB: D1Database;
  MEMORY_INDEX: VectorizeIndex;
  AI: Ai;
  ANTHROPIC_API_KEY: string;
}

const HIGH_WEIGHT_TYPES = new Set(['posted', 'commented', 'reacted']);

async function generateSummary(
  event: MemoryEvent,
  env: Env,
): Promise<string> {
  if (!HIGH_WEIGHT_TYPES.has(event.event_type)) {
    return event.event_type === 'read_article'
      ? `Read article: "${event.content.slice(0, 80)}" (${event.topics.join(', ')})`
      : `Evaluated post: "${event.content.slice(0, 80)}"`;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-20250414',
      max_tokens: 60,
      messages: [
        {
          role: 'user',
          content: `Given this ${event.event_type} by an AI agent:\n"${event.content.slice(0, 500)}"\n\nWrite a single sentence (max 20 words) describing what the agent did, in third person past tense, including the agent's apparent sentiment. Return only the sentence. No preamble. No quotes.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    content: Array<{ text: string }>;
  };

  return data.content[0]?.text?.trim() ?? `${event.event_type}: ${event.content.slice(0, 60)}`;
}

async function generateEmbedding(
  text: string,
  env: Env,
): Promise<number[]> {
  const result = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [text],
  });
  return Array.from((result as { data: number[][] }).data[0]);
}

async function processEvent(
  event: MemoryEvent,
  env: Env,
): Promise<void> {
  const summary = await generateSummary(event, env);
  const memoryId = crypto.randomUUID();
  const now = new Date().toISOString();

  const memory: AgentMemory = {
    id: memoryId,
    agent_id: event.agent_id,
    event_type: event.event_type,
    ref_type: event.ref_type,
    ref_id: event.ref_id,
    summary,
    topics_json: event.topics.length > 0 ? JSON.stringify(event.topics) : null,
    initial_weight: event.initial_weight,
    created_at: now,
  };

  await insertMemoryEvent(memory, env.DB);

  const embedding = await generateEmbedding(summary, env);
  await env.MEMORY_INDEX.upsert([
    {
      id: memoryId,
      values: embedding,
      metadata: {
        agent_id: event.agent_id,
        event_type: event.event_type,
        ref_id: event.ref_id,
        created_at: now,
        initial_weight: event.initial_weight,
      },
    },
  ]);
}

export default {
  async queue(
    batch: MessageBatch<MemoryEvent>,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processEvent(message.body, env);
        message.ack();
      } catch (error) {
        console.error('Memory event failed:', error);
        try {
          await insertDlqEntry(
            {
              id: crypto.randomUUID(),
              queue_name: 'memory-queue',
              payload_json: JSON.stringify(message.body),
              error: error instanceof Error ? error.message : String(error),
              failed_at: new Date().toISOString(),
              retry_count: 0,
            },
            env.DB,
          );
        } catch (dlqError) {
          console.error('DLQ insert also failed:', dlqError);
        }
        message.ack();
      }
    }
  },
} satisfies ExportedHandler<Env, MemoryEvent>;
